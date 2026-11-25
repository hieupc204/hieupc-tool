import { type Dispatch, type PointerEvent, type SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import {
  type ChangedFile,
  type DiffLine,
  loadViewed,
  parseDiff,
  type Review,
  type ReviewResult,
  reviewApi,
  saveViewed,
  viewedKey,
} from './review.ts';

const STATUS_LABEL: Record<string, string> = {
  M: 'sửa',
  A: 'mới',
  '?': 'mới',
  D: 'xoá',
  R: 'đổi tên',
  C: 'sao chép',
  T: 'đổi kiểu',
  U: 'xung đột',
};

type Toggled = Record<string, boolean>;

/** Diff dài hơn mức này thì hiện trước một phần, bấm để hiện hết */
const LINE_LIMIT = 800;
/** Ít file thì mở sẵn hết, nhiều quá thì để người dùng tự mở */
const AUTO_EXPAND_FILES = 8;

const WIDTH_KEY = 'web-tool.review-width';
const MIN_WIDTH = 320;

function loadWidth(): number {
  try {
    return Number(localStorage.getItem(WIDTH_KEY)) || 560;
  } catch {
    return 560;
  }
}

function saveWidth(width: number) {
  try {
    localStorage.setItem(WIDTH_KEY, String(width));
  } catch {
    // Chỉ là ghi nhớ tiện lợi
  }
}

interface Props {
  result: ReviewResult | null;
  error: string | null;
  onRefresh: () => void;
  onClose: () => void;
}

export function ReviewPanel({ result, error, onRefresh, onClose }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(loadWidth);
  const [expanded, setExpanded] = useState(false);
  /** File người dùng đã tự đóng/mở, theo từng repo; chưa đụng tới thì theo mặc định */
  const [toggled, setToggled] = useState<Toggled>({});

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const right = panelRef.current!.getBoundingClientRect().right;
    // Chừa chỗ cho bảng repo và terminal bên trái, khớp với max-width trong CSS
    const max = Math.max(MIN_WIDTH, panelRef.current!.parentElement!.clientWidth - 650);
    let next = width;
    const move = (e: globalThis.PointerEvent) => {
      next = Math.round(Math.min(max, Math.max(MIN_WIDTH, right - e.clientX)));
      setWidth(next);
    };
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
      saveWidth(next);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  };

  const review = result?.root ? result : null;

  return (
    <aside
      ref={panelRef}
      className={`review-panel${expanded ? ' is-expanded' : ''}`}
      style={expanded ? undefined : { width }}
      aria-label="Thay đổi chưa commit"
    >
      {!expanded && <div className="review-resize" title="Kéo để đổi độ rộng" onPointerDown={startResize} />}
      <div className="review-header">
        <span className="review-title">Thay đổi</span>
        {review && (
          <span className="review-branch" title={review.root}>
            {review.root.split('/').pop()} · {review.branch ?? 'detached'}
          </span>
        )}
        <div className="tabs-spacer" />
        <button className="review-button" title="Tải lại ngay (bình thường tự cập nhật)" onClick={onRefresh}>
          ↻
        </button>
        <button
          className="review-button"
          title={expanded ? 'Thu nhỏ về bên phải' : 'Phóng to, che terminal'}
          aria-pressed={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '⇥' : '⇤'}
        </button>
        <button className="review-button" title="Đóng bảng thay đổi" onClick={onClose}>
          ×
        </button>
      </div>
      {error && <p className="repo-error review-message">{error}</p>}
      {!result && !error && <p className="repo-hint review-message">Đang đọc thay đổi…</p>}
      {result && !result.root && (
        <p className="repo-hint review-message">
          Terminal này không đứng trong repo git nào. Hãy <code>cd</code> vào repo hoặc chọn một tab khác.
        </p>
      )}
      {review && <FileList key={review.root} review={review} toggled={toggled} setToggled={setToggled} />}
    </aside>
  );
}

interface FileListProps {
  review: Review;
  toggled: Toggled;
  setToggled: Dispatch<SetStateAction<Toggled>>;
}

function FileList({ review, toggled, setToggled }: FileListProps) {
  const { root, files, total } = review;
  const [viewed, setViewed] = useState(loadViewed);
  const [autoExpand] = useState(files.length <= AUTO_EXPAND_FILES);

  const isViewed = (file: ChangedFile) => viewed[viewedKey(root, file)] === file.version;
  const isOpen = (file: ChangedFile) => toggled[viewedKey(root, file)] ?? (autoExpand && !isViewed(file));

  const setOpen = (file: ChangedFile, open: boolean) => setToggled((prev) => ({ ...prev, [viewedKey(root, file)]: open }));

  const toggleViewed = (file: ChangedFile) => {
    const key = viewedKey(root, file);
    const next = { ...viewed };
    const marking = !isViewed(file);
    // Xoá rồi thêm lại để dấu mới nằm cuối, khi cắt bớt thì bỏ dấu cũ trước
    delete next[key];
    if (marking) next[key] = file.version;
    setViewed(next);
    saveViewed(next);
    setOpen(file, !marking);
  };

  // Agent sửa tiếp một file đã xem: bỏ trạng thái đóng do lúc đánh dấu để nó hiện ra lại
  const versions = useRef<Record<string, string>>({});
  useEffect(() => {
    const stale = files.filter((f) => {
      const before = versions.current[f.path];
      return before && before !== f.version && viewed[viewedKey(root, f)] === before;
    });
    if (stale.length) {
      setToggled((prev) => ({ ...prev, ...Object.fromEntries(stale.map((f) => [viewedKey(root, f), true])) }));
    }
    versions.current = Object.fromEntries(files.map((f) => [f.path, f.version]));
  }, [files]);

  if (files.length === 0) {
    return <p className="repo-hint review-message">Không có thay đổi nào chưa commit.</p>;
  }

  const sum = (key: 'additions' | 'deletions') => files.reduce((n, f) => n + (f[key] ?? 0), 0);
  const viewedCount = files.filter(isViewed).length;
  const anyOpen = files.some(isOpen);

  return (
    <>
      <div className="review-summary">
        <span>
          {total} file · <span className="review-add">+{sum('additions')}</span>{' '}
          <span className="review-del">−{sum('deletions')}</span> · đã xem {viewedCount}/{files.length}
        </span>
        <div className="tabs-spacer" />
        <button
          className="review-button"
          onClick={() => setToggled((prev) => ({ ...prev, ...Object.fromEntries(files.map((f) => [viewedKey(root, f), !anyOpen])) }))}
        >
          {anyOpen ? 'Đóng hết' : 'Mở hết'}
        </button>
      </div>
      <div className="review-list">
        {files.map((file) => (
          <FileItem
            key={file.path}
            root={root}
            base={review.base}
            file={file}
            open={isOpen(file)}
            viewed={isViewed(file)}
            changedAgain={Boolean(viewed[viewedKey(root, file)]) && !isViewed(file)}
            onToggle={() => setOpen(file, !isOpen(file))}
            onToggleViewed={() => toggleViewed(file)}
          />
        ))}
        {total > files.length && (
          <p className="repo-hint review-message">Chỉ hiện {files.length} trên {total} file.</p>
        )}
      </div>
    </>
  );
}

interface FileItemProps {
  root: string;
  base: string;
  file: ChangedFile;
  open: boolean;
  viewed: boolean;
  /** Đã xem rồi nhưng sau đó file lại bị sửa */
  changedAgain: boolean;
  onToggle: () => void;
  onToggleViewed: () => void;
}

function FileItem({ root, base, file, open, viewed, changedAgain, onToggle, onToggleViewed }: FileItemProps) {
  const slash = file.path.replace(/\/$/, '').lastIndexOf('/');
  const dir = slash === -1 ? '' : file.path.slice(0, slash + 1);
  const label = STATUS_LABEL[file.status] ?? file.status;

  return (
    <section className={`review-file${viewed ? ' is-viewed' : ''}`}>
      <div className="review-file-header">
        <button
          className="review-file-toggle"
          aria-expanded={open}
          title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
          onClick={onToggle}
        >
          <span className="review-caret">{open ? '▾' : '▸'}</span>
          <span className={`review-status is-${file.status === '?' ? 'A' : file.status}`}>{label}</span>
          <span className="review-path">
            <span className="review-dir">{dir}</span>
            <span className="review-name">{file.path.slice(slash + 1)}</span>
          </span>
          {changedAgain && <span className="review-again">sửa lại</span>}
          <span className="review-counts">
            {file.additions !== null && file.additions > 0 && <span className="review-add">+{file.additions}</span>}
            {file.deletions !== null && file.deletions > 0 && <span className="review-del">−{file.deletions}</span>}
          </span>
        </button>
        <label className="review-viewed" title="Đánh dấu đã xem. File bị sửa tiếp thì dấu này tự mất.">
          <input type="checkbox" checked={viewed} onChange={onToggleViewed} />
          Đã xem
        </label>
      </div>
      {open && <FileDiff root={root} base={base} file={file} />}
    </section>
  );
}

function FileDiff({ root, base, file }: { root: string; base: string; file: ChangedFile }) {
  const [diff, setDiff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let stale = false;
    reviewApi
      .diff(root, file)
      .then((res) => {
        if (stale) return;
        setDiff(res.diff);
        setError(null);
      })
      .catch((err) => !stale && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      stale = true;
    };
  }, [root, base, file.path, file.oldPath, file.status, file.version]);

  const lines = useMemo(() => (diff === null ? null : parseDiff(diff)), [diff]);

  if (error) return <p className="repo-error review-message">{error}</p>;
  if (!lines) return <p className="repo-hint review-message">Đang tải…</p>;
  if (lines.length === 0) {
    const text = file.path.endsWith('/')
      ? 'Thư mục này là một repo git khác, hãy mở terminal ở đó để xem.'
      : file.status === 'R'
        ? `Chỉ đổi tên, từ ${file.oldPath}`
        : 'File rỗng.';
    return <p className="repo-hint review-message">{text}</p>;
  }

  const shown = showAll ? lines : lines.slice(0, LINE_LIMIT);
  return (
    <div className="review-diff">
      <table>
        <tbody>
          {shown.map((line, i) => (
            <Row key={i} line={line} />
          ))}
        </tbody>
      </table>
      {shown.length < lines.length && (
        <button className="review-more" onClick={() => setShowAll(true)}>
          Hiện nốt {lines.length - shown.length} dòng
        </button>
      )}
    </div>
  );
}

const SIGN = { add: '+', del: '−', same: '', hunk: '', note: '' } as const;

function Row({ line }: { line: DiffLine }) {
  if (line.kind === 'hunk' || line.kind === 'note') {
    return (
      <tr className={`review-row is-${line.kind}`}>
        <td className="review-line-no" />
        <td className="review-line-no" />
        <td className="review-sign" />
        <td className="review-code">{line.kind === 'hunk' ? `⋯ ${line.text}` : line.text}</td>
      </tr>
    );
  }
  return (
    <tr className={`review-row is-${line.kind}`}>
      <td className="review-line-no">{line.oldLine}</td>
      <td className="review-line-no">{line.newLine}</td>
      <td className="review-sign">{SIGN[line.kind]}</td>
      <td className="review-code">{line.text || ' '}</td>
    </tr>
  );
}
