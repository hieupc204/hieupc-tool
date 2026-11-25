import { type FormEvent, useState } from 'react';
import { FolderPicker } from './FolderPicker.tsx';
import type { Repo, Worktree } from './repos.ts';

interface Props {
  /** Bảng đang được thu gọn (vẫn giữ nguyên nội dung đang gõ dở) */
  hidden: boolean;
  repos: Repo[];
  home: string;
  /** Thư mục của terminal đang được chọn */
  activePath?: string;
  /** Thư mục có terminal đang chạy việc gì đó */
  busyPaths: Set<string>;
  /** Thư mục có terminal vừa chạy xong / đang chờ mà chưa được xem */
  attentionPaths: Set<string>;
  canSaveCurrent: boolean;
  error: string | null;
  /** Mở terminal tại `path`; forceNew = luôn mở tab mới thay vì quay lại tab đang có */
  onOpen: (path: string, title: string, forceNew: boolean) => void;
  onSaveCurrent: () => void;
  onAddPath: (path: string) => Promise<boolean>;
  onRemove: (repo: Repo) => void;
  onCreateWorktree: (repo: Repo, branch: string) => Promise<boolean>;
  onRemoveWorktree: (repo: Repo, worktree: Worktree) => void;
}

// Giữ focus ở terminal khi bấm chuột vào danh sách
const keepFocus = (event: React.MouseEvent) => event.preventDefault();

export const worktreeTitle = (repo: Repo, worktree: Worktree) =>
  `${repo.name} ⑂ ${worktree.branch ?? 'detached'}`;

export function RepoPanel(props: Props) {
  const { repos, home, activePath, canSaveCurrent, error } = props;
  const [filter, setFilter] = useState('');
  const [newPath, setNewPath] = useState('');
  const [picking, setPicking] = useState(false);
  /** Repo đang mở ô nhập tên nhánh để tạo worktree */
  const [branchFormFor, setBranchFormFor] = useState<string | null>(null);
  const [branch, setBranch] = useState('');
  const [creating, setCreating] = useState(false);
  /** Worktree đang chờ bấm lần hai để xác nhận xoá */
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const shorten = (p: string) => (home && (p === home || p.startsWith(`${home}/`)) ? `~${p.slice(home.length)}` : p);

  const keyword = filter.trim().toLowerCase();
  const visible = keyword
    ? repos.filter((r) => r.name.toLowerCase().includes(keyword) || r.path.toLowerCase().includes(keyword))
    : repos;

  const submitPath = async (event: FormEvent) => {
    event.preventDefault();
    if (newPath.trim() && (await props.onAddPath(newPath))) setNewPath('');
  };

  const submitBranch = async (event: FormEvent, repo: Repo) => {
    event.preventDefault();
    if (!branch.trim() || creating) return;
    setCreating(true);
    const ok = await props.onCreateWorktree(repo, branch.trim());
    setCreating(false);
    if (ok) {
      setBranch('');
      setBranchFormFor(null);
    }
  };

  const dot = (path: string) =>
    props.attentionPaths.has(path) ? (
      <span className="status-dot is-attention" title="Vừa chạy xong hoặc đang chờ bạn" />
    ) : props.busyPaths.has(path) ? (
      <span className="status-dot is-busy" title="Đang chạy" />
    ) : null;

  return (
    <aside className="repo-panel" hidden={props.hidden}>
      <div className="repo-header">Repo đã lưu</div>
      {repos.length > 5 && (
        <input
          className="repo-input"
          placeholder="Tìm repo…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}

      <div className="repo-list">
        {repos.length === 0 && (
          <p className="repo-hint">
            Chưa có repo nào. Hãy <code>cd</code> tới repo trong terminal rồi bấm “Lưu thư mục hiện tại”.
          </p>
        )}
        {repos.length > 0 && visible.length === 0 && <p className="repo-hint">Không có repo nào khớp.</p>}
        {visible.map((repo) => (
          <div key={repo.id} className="repo-group">
            <div
              className={`repo-item${repo.path === activePath ? ' is-active' : ''}${repo.exists ? '' : ' is-missing'}`}
            >
              <button
                className="repo-open"
                title={repo.exists ? repo.path : `Không tìm thấy thư mục ${repo.path}`}
                onMouseDown={keepFocus}
                onClick={() => props.onOpen(repo.path, repo.name, false)}
              >
                <span className="repo-name">
                  {dot(repo.path)}
                  {repo.name}
                </span>
                {/* ‎ giữ thứ tự ký tự trái-sang-phải dù ô này cắt chữ ở phía đầu */}
                <span className="repo-path">{`‎${shorten(repo.path)}`}</span>
              </button>
              {repo.isGit && (
                <button
                  className="repo-action"
                  title="Tạo worktree: thư mục riêng trên nhánh riêng, để chạy thêm một agent song song"
                  onClick={() => {
                    setBranchFormFor(branchFormFor === repo.id ? null : repo.id);
                    setBranch('');
                  }}
                >
                  ⑂
                </button>
              )}
              <button
                className="repo-action"
                title="Mở thêm một terminal mới ở repo này"
                onMouseDown={keepFocus}
                onClick={() => props.onOpen(repo.path, repo.name, true)}
              >
                +
              </button>
              <button
                className="repo-action"
                title="Bỏ khỏi danh sách (không xoá thư mục)"
                onMouseDown={keepFocus}
                onClick={() => props.onRemove(repo)}
              >
                ×
              </button>
            </div>

            {branchFormFor === repo.id && (
              <form className="repo-add worktree-form" onSubmit={(e) => submitBranch(e, repo)}>
                <input
                  className="repo-input"
                  placeholder="Tên nhánh, vd. fix-login"
                  value={branch}
                  autoFocus
                  onChange={(e) => setBranch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setBranchFormFor(null)}
                />
                <button className="repo-add-button" type="submit" disabled={!branch.trim() || creating}>
                  {creating ? '…' : 'Tạo'}
                </button>
              </form>
            )}

            {repo.worktrees.map((worktree) => (
              <div
                key={worktree.path}
                className={`repo-item worktree-item${worktree.path === activePath ? ' is-active' : ''}`}
                onMouseLeave={() => setConfirmRemove(null)}
              >
                <button
                  className="repo-open"
                  title={worktree.path}
                  onMouseDown={keepFocus}
                  onClick={() => props.onOpen(worktree.path, worktreeTitle(repo, worktree), false)}
                >
                  <span className="repo-name">
                    {dot(worktree.path)}
                    <span className="worktree-mark">⑂</span>
                    {worktree.branch ?? 'detached'}
                  </span>
                </button>
                <button
                  className={`repo-action${confirmRemove === worktree.path ? ' is-confirm' : ''}`}
                  title="Xoá thư mục worktree, giữ lại nhánh. Git sẽ từ chối nếu còn thay đổi chưa commit."
                  onMouseDown={keepFocus}
                  onClick={() => {
                    if (confirmRemove !== worktree.path) {
                      setConfirmRemove(worktree.path);
                      return;
                    }
                    setConfirmRemove(null);
                    props.onRemoveWorktree(repo, worktree);
                  }}
                >
                  {confirmRemove === worktree.path ? 'Xoá?' : '×'}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="repo-footer">
        {error && <p className="repo-error">{error}</p>}
        <button
          className="primary repo-save"
          disabled={!canSaveCurrent}
          title="Lưu thư mục mà terminal đang mở đang đứng"
          onMouseDown={keepFocus}
          onClick={props.onSaveCurrent}
        >
          Lưu thư mục hiện tại
        </button>
        <form className="repo-add" onSubmit={submitPath}>
          <input
            className="repo-input"
            placeholder="Dán đường dẫn…"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
          />
          <button
            className="repo-add-button repo-browse"
            type="button"
            title="Chọn thư mục trên máy"
            aria-label="Chọn thư mục trên máy"
            onClick={() => setPicking(true)}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3.1a1.5 1.5 0 0 1 1.06.44L8.2 3.5H13A1.5 1.5 0 0 1 14.5 5v7A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12v-8.5Z" />
            </svg>
          </button>
          <button className="repo-add-button" type="submit" disabled={!newPath.trim()}>
            Lưu
          </button>
        </form>
      </div>
      {picking && (
        <FolderPicker
          startPath={newPath}
          onClose={() => setPicking(false)}
          onPick={async (picked) => {
            setPicking(false);
            if (await props.onAddPath(picked)) setNewPath('');
          }}
        />
      )}
    </aside>
  );
}
