import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import {
  loadNotifyEnabled,
  notificationsSupported,
  requestNotifyPermission,
  saveNotifyEnabled,
  showNotification,
} from './notifications.ts';
import { RepoPanel } from './RepoPanel.tsx';
import { type Repo, reposApi } from './repos.ts';
import { type AttentionReason, type SessionStatus, TerminalView } from './TerminalView.tsx';
import { ThemePicker } from './ThemePicker.tsx';
import { loadTheme, saveTheme, type TerminalTheme } from './themes.ts';

interface Session {
  id: number;
  title: string;
  status: SessionStatus;
  /** Thư mục khởi đầu; bỏ trống = thư mục mặc định của server */
  cwd?: string;
  /** Repo đã lưu mà tab này được mở từ đó */
  repoId?: string;
  /** Id phiên phía server, dùng để hỏi thư mục hiện tại của shell */
  serverId?: string;
  /** Đang có việc chạy trong terminal (agent, build, test…) */
  busy?: boolean;
  /** Có việc vừa xong hoặc đang chờ, mà người dùng chưa nhìn tới tab này */
  attention?: boolean;
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

const repoIdsWhere = (sessions: Session[], test: (s: Session) => boolean | undefined) =>
  new Set(sessions.filter((s) => s.repoId && test(s)).map((s) => s.repoId!));

export function TerminalTool({ active }: { active: boolean }) {
  const nextId = useRef(2);
  const [sessions, setSessions] = useState<Session[]>([
    { id: 1, title: 'Terminal 1', status: 'connecting' },
  ]);
  const [activeId, setActiveId] = useState(1);
  const [theme, setTheme] = useState(loadTheme);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [home, setHome] = useState('');
  const [repoError, setRepoError] = useState<string | null>(null);
  const [notifyEnabled, setNotifyEnabled] = useState(loadNotifyEnabled);
  const [notifyBlocked, setNotifyBlocked] = useState(
    () => notificationsSupported && Notification.permission === 'denied',
  );

  const activeSession = sessions.find((s) => s.id === activeId);

  // Các callback từ terminal sống lâu hơn một lần render, nên đọc trạng thái mới nhất qua ref
  const latest = useRef({ sessions, activeId, active, notifyEnabled });
  latest.current = { sessions, activeId, active, notifyEnabled };

  /** Người dùng có đang nhìn thẳng vào tab này không */
  const isWatching = (id: number) =>
    latest.current.active &&
    latest.current.activeId === id &&
    document.visibilityState === 'visible' &&
    document.hasFocus();

  useEffect(() => {
    reposApi
      .list()
      .then((data) => {
        setRepos(data.repos);
        setHome(data.home);
      })
      .catch((err) => setRepoError(`Không tải được danh sách repo: ${errorMessage(err)}`));
  }, []);

  const changeTheme = (next: TerminalTheme) => {
    setTheme(next);
    saveTheme(next);
  };

  const addSession = (init?: Pick<Session, 'title' | 'cwd' | 'repoId'>) => {
    const id = nextId.current++;
    setSessions((prev) => [...prev, { title: `Terminal ${id}`, ...init, id, status: 'connecting' }]);
    setActiveId(id);
  };

  const closeSession = (id: number) => {
    const remaining = sessions.filter((s) => s.id !== id);
    setSessions(remaining);
    if (id === activeId && remaining.length > 0) {
      const index = sessions.findIndex((s) => s.id === id);
      setActiveId(remaining[Math.min(index, remaining.length - 1)].id);
    }
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
      setActiveId(id);
    });
  };

  // Nhìn tới tab nào thì tắt dấu báo của tab đó
  useEffect(() => {
    const clear = () => {
      if (!isWatching(activeId)) return;
      setSessions((prev) =>
        prev.some((s) => s.id === activeId && s.attention)
          ? prev.map((s) => (s.id === activeId ? { ...s, attention: false } : s))
          : prev,
      );
    };
    clear();
    window.addEventListener('focus', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('focus', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, [activeId, active, sessions]);

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

  // Bấm vào repo: quay lại tab đang mở của repo đó nếu có, không thì mở tab mới ngay tại repo
  const openRepo = (repo: Repo, forceNew: boolean) => {
    setRepoError(null);
    const open = sessions.filter((s) => s.repoId === repo.id && s.status !== 'closed');
    // Ưu tiên tab đang chờ người dùng xem
    const existing = open.find((s) => s.attention) ?? open[0];
    if (existing && !forceNew) setActiveId(existing.id);
    else addSession({ title: repo.name, cwd: repo.path, repoId: repo.id });
  };

  const saveCurrentDir = async () => {
    if (!activeSession?.serverId) return;
    try {
      const { repo, created } = await reposApi.add({ sessionId: activeSession.serverId });
      mergeRepo(repo);
      patchSession(activeSession.id, { title: repo.name, repoId: repo.id });
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

  const dotClass = (session: Session) => {
    if (session.status !== 'open') return `is-${session.status}`;
    if (session.attention) return 'is-attention';
    return session.busy ? 'is-busy' : 'is-open';
  };

  const notifyTitle = notifyBlocked
    ? 'Trình duyệt đang chặn thông báo của trang này. Hãy cho phép trong cài đặt trang rồi bấm lại.'
    : notifyEnabled
      ? 'Đang bật thông báo khi terminal chạy xong. Bấm để tắt.'
      : 'Bật thông báo của trình duyệt khi terminal chạy xong';

  return (
    <div
      className="terminal-tool"
      style={
        {
          '--term-bg': theme.colors.background,
          '--term-fg': theme.colors.foreground,
        } as CSSProperties
      }
    >
      <RepoPanel
        repos={repos}
        home={home}
        activeRepoId={activeSession?.repoId}
        busyRepoIds={repoIdsWhere(sessions, (s) => s.busy && s.status === 'open')}
        attentionRepoIds={repoIdsWhere(sessions, (s) => s.attention)}
        canSaveCurrent={Boolean(activeSession?.serverId) && activeSession?.status === 'open'}
        error={repoError}
        onOpen={openRepo}
        onSaveCurrent={saveCurrentDir}
        onAddPath={addRepoByPath}
        onRemove={removeRepo}
      />
      <div className="terminal-main">
        <div className="tabs">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`tab${session.id === activeId ? ' is-active' : ''}${session.attention ? ' has-attention' : ''}`}
              onClick={() => setActiveId(session.id)}
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
          <button className="tab-add" title="Mở terminal mới" onClick={() => addSession()}>
            +
          </button>
          <div className="tabs-spacer" />
          {notificationsSupported && (
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
              {notifyEnabled ? 'Thông báo: bật' : 'Thông báo: tắt'}
            </button>
          )}
          <ThemePicker value={theme} onChange={changeTheme} />
        </div>
        <div className="terminal-body">
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
              active={active && session.id === activeId}
              theme={theme}
              cwd={session.cwd}
              onStatus={(status) => patchSession(session.id, { status })}
              onReady={(serverId) => patchSession(session.id, { serverId })}
              onBusy={(busy) => patchSession(session.id, { busy })}
              onAttention={(reason, text) => handleAttention(session.id, reason, text)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
