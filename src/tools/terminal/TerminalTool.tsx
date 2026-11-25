import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import {
  loadNotifyEnabled,
  notificationsSupported,
  requestNotifyPermission,
  saveNotifyEnabled,
  showNotification,
} from './notifications.ts';
import { RepoPanel, worktreeTitle } from './RepoPanel.tsx';
import { type Repo, reposApi, type Worktree } from './repos.ts';
import { ReviewPanel } from './ReviewPanel.tsx';
import { type AttentionReason, type SessionStatus, type Slot, TerminalView } from './TerminalView.tsx';
import { ThemePicker } from './ThemePicker.tsx';
import { loadTheme, saveTheme, type TerminalTheme } from './themes.ts';
import { useReview } from './useReview.ts';

interface Session {
  id: number;
  title: string;
  status: SessionStatus;
  /** Thư mục (repo hoặc worktree) mà tab này gắn với; bỏ trống = terminal tự do */
  cwd?: string;
  /** Id phiên phía server, dùng để hỏi thư mục hiện tại của shell */
  serverId?: string;
  /** Đang có việc chạy trong terminal (agent, build, test…) */
  busy?: boolean;
  /** Có việc vừa xong hoặc đang chờ, mà người dùng chưa nhìn tới tab này */
  attention?: boolean;
  /** Tab thuộc ô nào khi chia đôi: 0 = trái, 1 = phải. Tab ở bên nào thì luôn hiện ở bên đó. */
  side: PaneIndex;
}

/** Tab đang được chọn của mỗi ô: [trái, phải]. null = ô đó chưa có tab nào. */
type Panes = [number | null, number | null];
type PaneIndex = 0 | 1;

interface Layout {
  sessions: Session[];
  shown: Panes;
  split: boolean;
  focusedPane: PaneIndex;
}

/** Bỏ một tab khỏi bố cục: ô nào mất tab đang chọn thì chọn tab kề bên cùng ô; ô nào hết tab thì gộp về một ô */
function withoutSession(layout: Layout, id: number): Layout {
  const closed = layout.sessions.find((s) => s.id === id);
  if (!closed) return layout;
  const index = layout.sessions.indexOf(closed);
  let sessions = layout.sessions.filter((s) => s.id !== id);
  const shown: Panes = [...layout.shown];
  if (shown[closed.side] === id) {
    const sameSide = sessions.filter((s) => s.side === closed.side);
    const next = sameSide.find((s) => layout.sessions.indexOf(s) > index) ?? sameSide.at(-1);
    shown[closed.side] = next?.id ?? null;
  }
  // Ô trái hết tab mà ô phải còn: dồn tab bên phải sang trái
  if (shown[0] === null && shown[1] !== null) {
    sessions = sessions.map((s) => ({ ...s, side: 0 as const }));
    shown[0] = shown[1];
    shown[1] = null;
  }
  const split = layout.split && shown[0] !== null && shown[1] !== null;
  const focusedPane = shown[layout.focusedPane] === null ? 0 : layout.focusedPane;
  return { sessions, shown, split, focusedPane };
}

// Màn hình hẹp: bảng repo nổi đè lên terminal thay vì chiếm chỗ bên cạnh
const isNarrowScreen = () => window.matchMedia('(max-width: 640px)').matches;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

const pathsWhere = (sessions: Session[], test: (s: Session) => boolean | undefined) =>
  new Set(sessions.filter((s) => s.cwd && test(s)).map((s) => s.cwd!));

export function TerminalTool({ active }: { active: boolean }) {
  const nextId = useRef(2);
  const [sessions, setSessions] = useState<Session[]>([
    { id: 1, title: 'Terminal 1', status: 'connecting', side: 0 },
  ]);
  const [shown, setShown] = useState<Panes>([1, null]);
  const [isSplit, setIsSplit] = useState(false);
  const [focusedPane, setFocusedPane] = useState<PaneIndex>(0);
  const [theme, setTheme] = useState(loadTheme);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [home, setHome] = useState('');
  const [repoError, setRepoError] = useState<string | null>(null);
  const [repoPanelOpen, setRepoPanelOpen] = useState(() => !isNarrowScreen());
  const [notifyEnabled, setNotifyEnabled] = useState(loadNotifyEnabled);
  const [notifyBlocked, setNotifyBlocked] = useState(
    () => notificationsSupported && Notification.permission === 'denied',
  );

  /** Tab đang nhận bàn phím; các thao tác "hiện tại" đều tính theo tab này */
  const activeId = shown[focusedPane] ?? shown[0];
  const activeSession = sessions.find((s) => s.id === activeId);

  // Thay đổi chưa commit của repo mà tab đang chọn đang đứng; agent chạy xong thì đọc lại ngay
  const [reviewOpen, setReviewOpen] = useState(false);
  const review = useReview(
    { sessionId: activeSession?.serverId, path: activeSession?.cwd },
    active,
    reviewOpen,
    Boolean(activeSession?.busy),
  );
  const reviewResult = activeSession ? review.result : { root: null };
  const changeCount = reviewResult?.root ? reviewResult.total : 0;
  /** Các tab đang hiện trên màn hình: chia đôi thì mỗi ô một tab, không thì chỉ tab đang chọn */
  const visibleIds = isSplit ? shown : [activeId];

  // Các callback từ terminal sống lâu hơn một lần render, nên đọc trạng thái mới nhất qua ref
  const latest = useRef({ sessions, visibleIds, active, notifyEnabled });
  latest.current = { sessions, visibleIds, active, notifyEnabled };

  /** Tab này có đang hiện trước mắt người dùng không (ở ô trái hoặc ô phải) */
  const isWatching = (id: number) =>
    latest.current.active &&
    latest.current.visibleIds.includes(id) &&
    document.visibilityState === 'visible' &&
    document.hasFocus();

  const loadRepos = () =>
    reposApi
      .list()
      .then((data) => {
        setRepos(data.repos);
        setHome(data.home);
      })
      .catch((err) => setRepoError(`Không tải được danh sách repo: ${errorMessage(err)}`));

  useEffect(() => {
    loadRepos();
  }, []);

  const changeTheme = (next: TerminalTheme) => {
    setTheme(next);
    saveTheme(next);
  };

  /** Đưa một tab lên hiển thị ở đúng ô của nó và chuyển bàn phím sang ô đó */
  const showSession = (id: number) => {
    const session = latest.current.sessions.find((s) => s.id === id);
    if (!session) return;
    setShown((prev) => {
      const next: Panes = [...prev];
      next[session.side] = id;
      return next;
    });
    setFocusedPane(session.side);
  };

  const addSession = (init?: Pick<Session, 'title' | 'cwd'>, side: PaneIndex = focusedPane) => {
    const id = nextId.current++;
    setSessions((prev) => [...prev, { title: `Terminal ${id}`, ...init, id, status: 'connecting', side }]);
    setShown((prev) => {
      const next: Panes = [...prev];
      next[side] = id;
      return next;
    });
    setFocusedPane(side);
  };

  const closeSession = (id: number) => {
    const next = withoutSession({ sessions, shown, split: isSplit, focusedPane }, id);
    setSessions(next.sessions);
    setShown(next.shown);
    setIsSplit(next.split);
    setFocusedPane(next.focusedPane);
  };

  // Chia đôi: ô phải đã có tab thì hiện lại; chưa có thì mở một terminal mới ở đó,
  // cùng thư mục với tab đang xem (agent bên này, dev server bên kia)
  const toggleSplit = () => {
    if (isSplit) {
      setIsSplit(false);
      return;
    }
    if (!activeSession) return;
    if (shown[1] === null) {
      addSession(activeSession.cwd ? { title: activeSession.title, cwd: activeSession.cwd } : undefined, 1);
    }
    setIsSplit(true);
  };

  const patchSession = useCallback((id: number, patch: Partial<Session>) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  // Terminal báo có việc vừa xong / cần người dùng: đánh dấu tab và gửi thông báo nếu họ không đang nhìn
  const handleAttention = (id: number, reason: AttentionReason, text?: string) => {
    if (isWatching(id)) return;
    const session = latest.current.sessions.find((s) => s.id === id);
    // Đã báo mà chưa xem thì không báo dồn (vd. dev server cứ in log từng đợt)
    if (!session || session.attention) return;
    patchSession(id, { attention: true });
    if (!latest.current.notifyEnabled) return;
    const title = reason === 'done' ? `${session.title}: đã chạy xong` : `${session.title}: cần bạn xem`;
    showNotification(title, text || session.cwd || '', `web-tool-terminal-${id}`, () => {
      window.focus();
      showSession(id);
    });
  };

  // Nhìn tới tab nào thì tắt dấu báo của tab đó
  useEffect(() => {
    const clear = () => {
      const watched = (s: Session) => s.attention && isWatching(s.id);
      setSessions((prev) => (prev.some(watched) ? prev.map((s) => (watched(s) ? { ...s, attention: false } : s)) : prev));
    };
    clear();
    window.addEventListener('focus', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('focus', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, [shown, isSplit, focusedPane, active, sessions]);

  const attentionCount = sessions.filter((s) => s.attention).length;
  useEffect(() => {
    document.title = attentionCount > 0 ? `(${attentionCount}) Web Tool` : 'Web Tool';
  }, [attentionCount]);

  const toggleNotify = async () => {
    if (notifyEnabled) {
      setNotifyEnabled(false);
      saveNotifyEnabled(false);
      return;
    }
    const granted = await requestNotifyPermission();
    setNotifyBlocked(!granted && Notification.permission === 'denied');
    setNotifyEnabled(granted);
    saveNotifyEnabled(granted);
  };

  const mergeRepo = (repo: Repo) =>
    setRepos((prev) =>
      [...prev.filter((r) => r.id !== repo.id), repo].sort((a, b) => a.name.localeCompare(b.name)),
    );

  // Bấm vào repo hoặc worktree: quay lại tab đang mở ở thư mục đó nếu có, không thì mở tab mới ở ô đang đứng
  const openPath = (path: string, title: string, forceNew: boolean) => {
    setRepoError(null);
    // Đang chia đôi thì chỉ tính tab của ô đang đứng: ô này chưa có repo đó thì mở tab mới ngay tại đây,
    // dù ô bên kia đã mở sẵn
    const open = sessions.filter(
      (s) => s.cwd === path && s.status !== 'closed' && (!isSplit || s.side === focusedPane),
    );
    // Ưu tiên tab đang chờ người dùng xem
    const existing = open.find((s) => s.attention) ?? open[0];
    if (existing && !forceNew) showSession(existing.id);
    else addSession({ title, cwd: path });
    if (isNarrowScreen()) setRepoPanelOpen(false);
  };

  const saveCurrentDir = async () => {
    if (!activeSession?.serverId) return;
    try {
      const { repo, created } = await reposApi.add({ sessionId: activeSession.serverId });
      mergeRepo(repo);
      patchSession(activeSession.id, { title: repo.name, cwd: repo.path });
      setRepoError(created ? null : `“${repo.name}” đã có trong danh sách.`);
    } catch (err) {
      setRepoError(errorMessage(err));
    }
  };

  const addRepoByPath = async (path: string) => {
    try {
      const { repo, created } = await reposApi.add({ path });
      mergeRepo(repo);
      setRepoError(created ? null : `“${repo.name}” đã có trong danh sách.`);
      return true;
    } catch (err) {
      setRepoError(errorMessage(err));
      return false;
    }
  };

  const removeRepo = async (repo: Repo) => {
    try {
      await reposApi.remove(repo.id);
      setRepos((prev) => prev.filter((r) => r.id !== repo.id));
      setRepoError(null);
    } catch (err) {
      setRepoError(errorMessage(err));
    }
  };

  // Tạo worktree rồi mở luôn terminal ở đó
  const createWorktree = async (repo: Repo, branch: string) => {
    try {
      const result = await reposApi.addWorktree(repo.id, branch);
      mergeRepo(result.repo);
      setRepoError(null);
      addSession({ title: worktreeTitle(repo, result.worktree), cwd: result.worktree.path });
      return true;
    } catch (err) {
      setRepoError(errorMessage(err));
      return false;
    }
  };

  const removeWorktree = async (repo: Repo, worktree: Worktree) => {
    try {
      const result = await reposApi.removeWorktree(repo.id, worktree.path);
      mergeRepo(result.repo);
      setRepoError(null);
    } catch (err) {
      setRepoError(`Không xoá được worktree: ${errorMessage(err)}`);
    }
  };

  const dotClass = (session: Session) => {
    if (session.status !== 'open') return `is-${session.status}`;
    if (session.attention) return 'is-attention';
    return session.busy ? 'is-busy' : 'is-open';
  };

  const slotOf = (id: number): Slot => {
    if (!isSplit) return id === activeId ? 'full' : null;
    if (shown[0] === id) return 'left';
    return shown[1] === id ? 'right' : null;
  };

  const tabClass = (session: Session) =>
    [
      'tab',
      session.id === activeId && 'is-active',
      session.id !== activeId && visibleIds.includes(session.id) && 'is-shown',
      session.attention && 'has-attention',
    ]
      .filter(Boolean)
      .join(' ');

  const notifyTitle = notifyBlocked
    ? 'Trình duyệt đang chặn thông báo của trang này. Hãy cho phép trong cài đặt trang rồi bấm lại.'
    : notifyEnabled
      ? 'Đang bật thông báo khi terminal chạy xong. Bấm để tắt.'
      : 'Bật thông báo của trình duyệt khi terminal chạy xong';
  const splitTitle = isSplit
    ? 'Bỏ chia đôi (các tab bên phải vẫn còn, chia lại là về đúng chỗ cũ)'
    : shown[1] !== null
      ? 'Chia đôi: hiện lại các tab bên phải'
      : 'Chia đôi: mở thêm một terminal bên phải, cùng thư mục';

  // Chia đôi thì mỗi ô có dải tab riêng nằm ngay trên ô đó; không chia thì một dải chứa mọi tab
  const tabStrip = (list: Session[], side?: PaneIndex) => (
    <div className="tab-strip">
      {list.map((session) => (
        <div
          key={session.id}
          className={tabClass(session)}
          // Không để tab lấy mất focus của terminal
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => showSession(session.id)}
        >
          <span className={`status-dot ${dotClass(session)}`} />
          {session.title}
          <button
            className="tab-close"
            title="Đóng phiên"
            onClick={(event) => {
              event.stopPropagation();
              closeSession(session.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="tab-add"
        title={side === undefined ? 'Mở terminal mới' : `Mở terminal mới ở ô bên ${side === 0 ? 'trái' : 'phải'}`}
        onClick={() => addSession(undefined, side)}
      >
        +
      </button>
    </div>
  );

  const cramped = isSplit && reviewOpen;

  // Các nút bên phải thanh tab; khi chia đôi thì nằm cuối dải tab của ô phải
  const barControls = (
    <>
      <div className="tabs-spacer" />
      <button
        className={`bar-button review-toggle${reviewOpen ? ' is-on' : ''}`}
        title={reviewOpen ? 'Đóng bảng thay đổi' : 'Xem các file thay đổi chưa commit'}
        aria-label={reviewOpen ? 'Đóng bảng thay đổi' : 'Xem các file thay đổi chưa commit'}
        aria-pressed={reviewOpen}
        onClick={() => setReviewOpen((open) => !open)}
      >
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <rect x="2.7" y="1.7" width="10.6" height="12.6" rx="2" />
          <path d="M8 4.5v4M6 6.5h4M6 11.2h4" />
        </svg>
        {changeCount > 0 && <span className="review-badge">{changeCount}</span>}
      </button>
      <button
        className={`bar-button${isSplit ? ' is-on' : ''}`}
        title={splitTitle}
        aria-label={splitTitle}
        aria-pressed={isSplit}
        onClick={toggleSplit}
      >
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <rect x="1.7" y="2.7" width="12.6" height="10.6" rx="2" />
          <path d="M8 2.7v10.6" />
        </svg>
      </button>
      {/* Vừa chia đôi vừa mở bảng thay đổi thì rất chật: tạm ẩn hai nút cài đặt ít dùng, nhường chỗ cho tab */}
      {!cramped && notificationsSupported && (
        <button
          className={`notify-toggle${notifyEnabled ? ' is-on' : ''}${notifyBlocked ? ' is-blocked' : ''}`}
          title={notifyTitle}
          aria-label={notifyTitle}
          aria-pressed={notifyEnabled}
          onClick={toggleNotify}
        >
          <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
            <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5v2.3L2.2 10.6a.75.75 0 0 0 .65 1.15h10.3a.75.75 0 0 0 .65-1.15L12.5 8.3V6A4.5 4.5 0 0 0 8 1.5ZM6.3 13a1.75 1.75 0 0 0 3.4 0H6.3Z" />
          </svg>
          <span className="notify-label">{notifyEnabled ? 'Thông báo: bật' : 'Thông báo: tắt'}</span>
        </button>
      )}
      {!cramped && <ThemePicker value={theme} onChange={changeTheme} />}
    </>
  );

  return (
    <div
      className="terminal-tool"
      style={
        {
          '--term-bg': theme.colors.background,
          '--term-fg': theme.colors.foreground,
          '--term-green': theme.colors.green,
          '--term-red': theme.colors.red,
        } as CSSProperties
      }
    >
      {repoPanelOpen && <div className="repo-backdrop" onClick={() => setRepoPanelOpen(false)} />}
      <RepoPanel
        hidden={!repoPanelOpen}
        repos={repos}
        home={home}
        activePath={activeSession?.cwd}
        busyPaths={pathsWhere(sessions, (s) => s.busy && s.status === 'open')}
        attentionPaths={pathsWhere(sessions, (s) => s.attention)}
        canSaveCurrent={Boolean(activeSession?.serverId) && activeSession?.status === 'open'}
        error={repoError}
        onOpen={openPath}
        onSaveCurrent={saveCurrentDir}
        onAddPath={addRepoByPath}
        onRemove={removeRepo}
        onCreateWorktree={createWorktree}
        onRemoveWorktree={removeWorktree}
      />
      <div className="terminal-main">
        <div className={`tabs${reviewOpen ? ' is-compact' : ''}`}>
          <div className="tab-group">
            <button
              className={`repo-toggle${attentionCount > 0 && !repoPanelOpen ? ' has-attention' : ''}`}
              title={repoPanelOpen ? 'Ẩn bảng repo' : 'Hiện bảng repo'}
              aria-label={repoPanelOpen ? 'Ẩn bảng repo' : 'Hiện bảng repo'}
              aria-pressed={repoPanelOpen}
              onClick={() => setRepoPanelOpen((open) => !open)}
            >
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                <rect x="1.7" y="2.7" width="12.6" height="10.6" rx="2" />
                <path d="M6 2.7v10.6" />
              </svg>
            </button>
            {tabStrip(isSplit ? sessions.filter((s) => s.side === 0) : sessions, isSplit ? 0 : undefined)}
            {!isSplit && barControls}
          </div>
          {isSplit && (
            <div className="tab-group">
              {tabStrip(sessions.filter((s) => s.side === 1), 1)}
              {barControls}
            </div>
          )}
        </div>
        <div className={`terminal-body${isSplit ? ` is-split focus-${focusedPane === 0 ? 'left' : 'right'}` : ''}`}>
          {sessions.length === 0 && (
            <div className="empty">
              <button className="primary" onClick={() => addSession()}>
                Mở terminal mới
              </button>
            </div>
          )}
          {sessions.map((session) => (
            <TerminalView
              key={session.id}
              slot={active ? slotOf(session.id) : null}
              focused={active && session.id === activeId}
              theme={theme}
              cwd={session.cwd}
              onFocus={() => setFocusedPane(session.side)}
              onStatus={(status) => patchSession(session.id, { status })}
              onReady={(serverId) => patchSession(session.id, { serverId })}
              onBusy={(busy) => patchSession(session.id, { busy })}
              onAttention={(reason, text) => handleAttention(session.id, reason, text)}
            />
          ))}
        </div>
      </div>
      {reviewOpen && (
        <ReviewPanel
          result={reviewResult}
          error={review.error}
          onRefresh={() => void review.refresh()}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </div>
  );
}
