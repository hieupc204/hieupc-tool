import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readlink, stat } from 'node:fs/promises';
import type { IncomingMessage, Server } from 'node:http';
import os from 'node:os';
import { promisify } from 'node:util';
import pty from 'node-pty';
import { createActivityTracker } from './activity.ts';
import { WebSocketServer, type WebSocket } from 'ws';
import { isTrustedOrigin } from './security.ts';

export const TERMINAL_WS_PATH = '/ws/terminal';

const execFileAsync = promisify(execFile);

/** Các phiên đang chạy, để tra thư mục hiện tại của shell theo id. */
const sessions = new Map<string, pty.IPty>();

export async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

/** Thư mục hiện tại của shell trong phiên (nơi người dùng đã `cd` tới). */
export async function getSessionCwd(sessionId: string): Promise<string | null> {
  const term = sessions.get(sessionId);
  if (!term) return null;
  try {
    if (process.platform === 'linux') return await readlink(`/proc/${term.pid}/cwd`);
    const { stdout } = await execFileAsync('lsof', ['-a', '-p', String(term.pid), '-d', 'cwd', '-Fn']);
    const line = stdout.split('\n').find((l) => l.startsWith('n'));
    return line ? line.slice(1) : null;
  } catch {
    return null;
  }
}

function clampSize(value: string | null, fallback: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}

function defaultShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') return { file: 'powershell.exe', args: [] };
  // Login shell để PATH và cấu hình giống Terminal.app
  return { file: process.env.SHELL || '/bin/zsh', args: ['-l'] };
}

type ClientMessage =
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number };

async function handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const params = new URL(req.url ?? '', 'http://localhost').searchParams;
  const send = (msg: object) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  // Tin nhắn có thể tới trong lúc đang kiểm tra thư mục, giữ lại để không mất phím gõ
  const pending: string[] = [];
  const queue = (raw: unknown) => pending.push(String(raw));
  ws.on('message', queue);

  const defaultCwd = process.env.WEB_TOOL_CWD || os.homedir();
  const requestedCwd = params.get('cwd');
  const cwdOk = requestedCwd ? await isDirectory(requestedCwd) : false;
  if (ws.readyState !== ws.OPEN) return;

  const { file, args } = defaultShell();
  let term: pty.IPty;
  try {
    term = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: clampSize(params.get('cols'), 80, 500),
      rows: clampSize(params.get('rows'), 24, 300),
      cwd: cwdOk ? requestedCwd! : defaultCwd,
      env: { ...process.env, TERM_PROGRAM: 'web-tool' } as Record<string, string>,
    });
  } catch (err) {
    send({ type: 'error', message: `Không khởi động được shell: ${String(err)}` });
    ws.close();
    return;
  }

  const id = randomUUID();
  sessions.set(id, term);
  send({ type: 'ready', id });
  if (requestedCwd && !cwdOk) {
    send({ type: 'error', message: `Không tìm thấy thư mục ${requestedCwd}, mở ở thư mục mặc định.` });
  }

  let exited = false;
  const activity = createActivityTracker((state) => send({ type: 'activity', state }));

  term.onData((data) => {
    activity.output();
    send({ type: 'output', data });
  });

  term.onExit(({ exitCode }) => {
    exited = true;
    activity.stop();
    sessions.delete(id);
    send({ type: 'exit', code: exitCode });
    ws.close();
  });

  const onMessage = (raw: string) => {
    if (exited) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === 'input' && typeof msg.data === 'string') {
      activity.input();
      term.write(msg.data);
    } else if (msg.type === 'resize') {
      const cols = clampSize(String(msg.cols), 80, 500);
      const rows = clampSize(String(msg.rows), 24, 300);
      try {
        term.resize(cols, rows);
      } catch {
        // pty vừa thoát giữa chừng
      }
    }
  };

  ws.off('message', queue);
  pending.forEach(onMessage);
  ws.on('message', (raw) => onMessage(String(raw)));

  ws.on('close', () => {
    activity.stop();
    sessions.delete(id);
    if (!exited) term.kill();
  });
}

export function attachTerminal(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', handleConnection);

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '', 'http://localhost');
    if (pathname !== TERMINAL_WS_PATH) {
      socket.destroy();
      return;
    }
    if (!isTrustedOrigin(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
}
