import { type FormEvent, useState } from 'react';
import { FolderPicker } from './FolderPicker.tsx';
import type { Repo } from './repos.ts';

interface Props {
  repos: Repo[];
  home: string;
  activeRepoId?: string;
  /** Repo có terminal đang chạy việc gì đó */
  busyRepoIds: Set<string>;
  /** Repo có terminal vừa chạy xong / đang chờ mà chưa được xem */
  attentionRepoIds: Set<string>;
  canSaveCurrent: boolean;
  error: string | null;
  onOpen: (repo: Repo, forceNew: boolean) => void;
  onSaveCurrent: () => void;
  onAddPath: (path: string) => Promise<boolean>;
  onRemove: (repo: Repo) => void;
}

// Giữ focus ở terminal khi bấm chuột vào danh sách
const keepFocus = (event: React.MouseEvent) => event.preventDefault();

export function RepoPanel(props: Props) {
  const { repos, home, activeRepoId, canSaveCurrent, error } = props;
  const [filter, setFilter] = useState('');
  const [newPath, setNewPath] = useState('');
  const [picking, setPicking] = useState(false);

  const shorten = (p: string) => (home && (p === home || p.startsWith(`${home}/`)) ? `~${p.slice(home.length)}` : p);

  const keyword = filter.trim().toLowerCase();
  const visible = keyword
    ? repos.filter((r) => r.name.toLowerCase().includes(keyword) || r.path.toLowerCase().includes(keyword))
    : repos;

  const submitPath = async (event: FormEvent) => {
    event.preventDefault();
    if (newPath.trim() && (await props.onAddPath(newPath))) setNewPath('');
  };

  return (
    <aside className="repo-panel">
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
          <div
            key={repo.id}
            className={`repo-item${repo.id === activeRepoId ? ' is-active' : ''}${repo.exists ? '' : ' is-missing'}`}
          >
            <button
              className="repo-open"
              title={repo.exists ? repo.path : `Không tìm thấy thư mục ${repo.path}`}
              onMouseDown={keepFocus}
              onClick={() => props.onOpen(repo, false)}
            >
              <span className="repo-name">
                {props.attentionRepoIds.has(repo.id) ? (
                  <span className="status-dot is-attention" title="Vừa chạy xong hoặc đang chờ bạn" />
                ) : props.busyRepoIds.has(repo.id) ? (
                  <span className="status-dot is-busy" title="Đang chạy" />
                ) : null}
                {repo.name}
              </span>
              {/* ‎ giữ thứ tự ký tự trái-sang-phải dù ô này cắt chữ ở phía đầu */}
              <span className="repo-path">{`‎${shorten(repo.path)}`}</span>
            </button>
            <button
              className="repo-action"
              title="Mở thêm một terminal mới ở repo này"
              onMouseDown={keepFocus}
              onClick={() => props.onOpen(repo, true)}
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
