import { useEffect, useState } from 'react';
import { type DirListing, fsApi } from './repos.ts';

const LAST_DIR_KEY = 'web-tool.terminal.lastBrowsedDir';

function readLastDir(): string | undefined {
  try {
    return localStorage.getItem(LAST_DIR_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function rememberDir(dir: string): void {
  try {
    localStorage.setItem(LAST_DIR_KEY, dir);
  } catch {
    // Không lưu được thì lần sau mở lại từ thư mục home
  }
}

/** Tách đường dẫn thành các chặng bấm được: / › Users › me › code */
function crumbs(fullPath: string): { label: string; path: string }[] {
  const parts = fullPath.split('/').filter(Boolean);
  return [
    { label: '/', path: '/' },
    ...parts.map((label, i) => ({ label, path: `/${parts.slice(0, i + 1).join('/')}` })),
  ];
}

interface Props {
  /** Thư mục mở đầu tiên; bỏ trống = nơi duyệt lần trước, hoặc home */
  startPath?: string;
  onPick: (path: string) => void;
  onClose: () => void;
}

export function FolderPicker({ startPath, onPick, onClose }: Props) {
  const [listing, setListing] = useState<DirListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const go = (target?: string, fallbackToHome = false) => {
    setLoading(true);
    fsApi
      .browse(target)
      .then((data) => {
        setListing(data);
        setError(null);
        rememberDir(data.path);
      })
      .catch((err) => {
        // Thư mục mở đầu không còn tồn tại thì lùi về home thay vì kẹt ở màn hình lỗi
        if (fallbackToHome && target) go(undefined);
        else setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    go(startPath?.trim() || readLastDir(), true);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker" role="dialog" aria-label="Chọn thư mục" onClick={(e) => e.stopPropagation()}>
        <div className="picker-header">
          <span className="picker-title">Chọn thư mục repo</span>
          <button className="repo-action picker-close" title="Đóng" onClick={onClose}>
            ×
          </button>
        </div>

        {listing && (
          <div className="picker-crumbs">
            {listing.home && (
              <button className="picker-crumb" title={listing.home} onClick={() => go(listing.home)}>
                ~
              </button>
            )}
            {crumbs(listing.path).map((crumb) => (
              <button key={crumb.path} className="picker-crumb" onClick={() => go(crumb.path)}>
                {crumb.label}
              </button>
            ))}
          </div>
        )}

        <div className={`picker-list${loading ? ' is-loading' : ''}`}>
          {error && <p className="repo-error">{error}</p>}
          {listing?.parent && (
            <button className="picker-row" onClick={() => go(listing.parent!)}>
              <span className="picker-icon">↑</span>
              <span className="picker-name">..</span>
            </button>
          )}
          {listing?.dirs.map((dir) => (
            <div key={dir.path} className="picker-row">
              <button className="picker-enter" title={`Mở ${dir.path}`} onClick={() => go(dir.path)}>
                <span className="picker-icon">▸</span>
                <span className="picker-name">{dir.name}</span>
                {dir.isRepo && <span className="picker-badge">git</span>}
              </button>
              <button className="picker-quick" title={`Lưu ${dir.path}`} onClick={() => onPick(dir.path)}>
                Lưu
              </button>
            </div>
          ))}
          {listing && listing.dirs.length === 0 && !error && (
            <p className="repo-hint">Không có thư mục con.</p>
          )}
        </div>

        <div className="picker-footer">
          <span className="picker-current" title={listing?.path}>
            {listing ? `‎${listing.path}` : ''}
          </span>
          <button className="repo-add-button" onClick={onClose}>
            Huỷ
          </button>
          <button className="primary" disabled={!listing} onClick={() => listing && onPick(listing.path)}>
            Lưu thư mục này
          </button>
        </div>
      </div>
    </div>
  );
}
