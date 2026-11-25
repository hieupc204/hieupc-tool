import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef, useState } from 'react';
import { droppedPaths, hasDroppable } from './dropFiles.ts';
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

/** Vị trí hiển thị: cả vùng, nửa trái, nửa phải; null = đang ẩn */
export type Slot = 'full' | 'left' | 'right' | null;

interface Props {
  slot: Slot;
  /** Ô đang nhận bàn phím */
  focused: boolean;
  /** Người dùng bấm vào terminal này */
  onFocus: () => void;
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
  const { slot, focused, theme, cwd } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  // Callback mới nhất, để effect tạo terminal (chỉ chạy một lần) luôn gọi đúng bản hiện tại
  const callbacks = useRef(props);
  callbacks.current = props;
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<() => void>(() => {});
  const initialTheme = useRef(theme);
  const insertRef = useRef<(data: DataTransfer) => void>(() => {});
  const dragDepth = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  /** Dòng báo nổi ở góc: đang tải file lên, hoặc lỗi */
  const [note, setNote] = useState<string | null>(null);

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

    // Kéo thả / dán file: chèn đường dẫn vào dòng lệnh như terminal thật.
    // Dùng term.paste để chương trình bật bracketed paste (Claude Code…) nhận ra đây là nội dung dán.
    let noteTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const insert = async (data: DataTransfer) => {
      clearTimeout(noteTimer);
      setNote('Đang đưa file vào…');
      const { paths, errors } = await droppedPaths(data);
      if (disposed) return;
      if (paths.length) {
        term.paste(paths.join(' ') + ' ');
        term.focus();
      }
      setNote(errors.length ? errors.join(' · ') : null);
      if (errors.length) noteTimer = setTimeout(() => setNote(null), 6000);
    };
    insertRef.current = (data) => void insert(data);
    // Bắt ở pha capture để chặn trước xterm; văn bản thường thì vẫn để xterm tự dán
    const onPaste = (event: ClipboardEvent) => {
      const data = event.clipboardData;
      if (!data || data.files.length === 0 || data.getData('text/plain')) return;
      event.preventDefault();
      event.stopPropagation();
      void insert(data);
    };
    container.addEventListener('paste', onPaste, true);

    return () => {
      disposed = true;
      clearTimeout(noteTimer);
      container.removeEventListener('paste', onPaste, true);
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
    if (slot) fitRef.current();
  }, [slot]);

  useEffect(() => {
    if (focused) termRef.current?.focus();
  }, [focused]);

  return (
    <div
      ref={containerRef}
      className={`terminal-view slot-${slot ?? 'none'}${dragOver ? ' is-drop-target' : ''}`}
      hidden={!slot}
      onMouseDown={props.onFocus}
      onFocusCapture={props.onFocus}
      onDragEnter={(event) => {
        if (!hasDroppable(event.dataTransfer)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragOver={(event) => {
        if (!hasDroppable(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragOver(false);
      }}
      onDrop={(event) => {
        dragDepth.current = 0;
        setDragOver(false);
        if (!hasDroppable(event.dataTransfer)) return;
        event.preventDefault();
        props.onFocus();
        insertRef.current(event.dataTransfer);
      }}
    >
      {dragOver && <div className="terminal-drop-hint">Thả để chèn đường dẫn file</div>}
      {note && <div className="terminal-note">{note}</div>}
    </div>
  );
}
