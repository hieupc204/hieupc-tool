import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef } from 'react';
import type { TerminalTheme } from './themes.ts';

export type SessionStatus = 'connecting' | 'open' | 'closed';

/** done = việc đang chạy vừa dừng; bell/message = chương trình trong terminal chủ động gọi người dùng */
export type AttentionReason = 'done' | 'bell' | 'message';

type ServerMessage =
  | { type: 'ready'; id: string }
  | { type: 'output'; data: string }
  | { type: 'activity'; state: 'busy' | 'done' }
  | { type: 'exit'; code: number }
  | { type: 'error'; message: string };

interface Props {
  active: boolean;
  theme: TerminalTheme;
  /** Thư mục khởi đầu của shell (chỉ dùng lúc tạo phiên) */
  cwd?: string;
  onStatus: (status: SessionStatus) => void;
  /** Server đã tạo shell và cấp id cho phiên */
  onReady: (serverId: string) => void;
  /** Có việc đang chạy trong terminal hay không (server đoán theo dòng output) */
  onBusy: (busy: boolean) => void;
  onAttention: (reason: AttentionReason, text?: string) => void;
}

export function TerminalView(props: Props) {
  const { active, theme, cwd } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  // Callback mới nhất, để effect tạo terminal (chỉ chạy một lần) luôn gọi đúng bản hiện tại
  const callbacks = useRef(props);
  callbacks.current = props;
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<() => void>(() => {});
  const initialTheme = useRef(theme);

  useEffect(() => {
    const container = containerRef.current!;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "SF Mono", Consolas, monospace',
      fontSize: 13,
      scrollback: 5000,
      macOptionIsMeta: true,
      theme: initialTheme.current.colors,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(container);

    // Chương trình trong terminal gọi người dùng: chuông, hoặc thông báo kiểu iTerm2 (OSC 9) / OSC 777
    const onBell = term.onBell(() => callbacks.current.onAttention('bell'));
    const osc9 = term.parser.registerOscHandler(9, (data) => {
      if (/^4(;|$)/.test(data)) return false; // OSC 9;4 là thanh tiến độ, không phải thông báo
      callbacks.current.onAttention('message', data);
      return true;
    });
    const osc777 = term.parser.registerOscHandler(777, (data) => {
      const [kind, title, ...body] = data.split(';');
      if (kind !== 'notify') return false;
      callbacks.current.onAttention('message', [title, body.join(';')].filter(Boolean).join(': '));
      return true;
    });
    termRef.current = term;

    // Khi tab đang ẩn thì kích thước = 0, fit sẽ cho ra số cột/dòng sai.
    const fit = () => {
      if (container.offsetWidth > 0 && container.offsetHeight > 0) fitAddon.fit();
    };
    fitRef.current = fit;
    fit();

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const query = new URLSearchParams({ cols: String(term.cols), rows: String(term.rows) });
    if (cwd) query.set('cwd', cwd);
    const ws = new WebSocket(`${proto}://${location.host}/ws/terminal?${query}`);
    const send = (msg: object) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    ws.onopen = () => {
      callbacks.current.onStatus('open');
      // Kích thước có thể đã đổi trong lúc đang kết nối
      send({ type: 'resize', cols: term.cols, rows: term.rows });
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      if (msg.type === 'output') term.write(msg.data);
      else if (msg.type === 'ready') callbacks.current.onReady(msg.id);
      else if (msg.type === 'activity') {
        callbacks.current.onBusy(msg.state === 'busy');
        if (msg.state === 'done') callbacks.current.onAttention('done');
      }
      else if (msg.type === 'exit') term.write(`\r\n\x1b[90m[shell đã thoát, mã ${msg.code}]\x1b[0m\r\n`);
      else if (msg.type === 'error') term.write(`\r\n\x1b[31m${msg.message}\x1b[0m\r\n`);
    };
    ws.onclose = () => {
      callbacks.current.onStatus('closed');
      callbacks.current.onBusy(false);
      term.write('\r\n\x1b[90m[đã ngắt kết nối]\x1b[0m\r\n');
    };

    const onData = term.onData((data) => send({ type: 'input', data }));
    const onResize = term.onResize(({ cols, rows }) => send({ type: 'resize', cols, rows }));
    const observer = new ResizeObserver(fit);
    observer.observe(container);

    return () => {
      observer.disconnect();
      onData.dispose();
      onResize.dispose();
      onBell.dispose();
      osc9.dispose();
      osc777.dispose();
      ws.onclose = null;
      ws.close();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = theme.colors;
  }, [theme]);

  useEffect(() => {
    if (!active) return;
    fitRef.current();
    termRef.current?.focus();
  }, [active]);

  return <div ref={containerRef} className="terminal-view" hidden={!active} />;
}
