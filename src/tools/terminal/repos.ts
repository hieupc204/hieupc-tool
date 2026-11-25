export interface Repo {
  id: string;
  name: string;
  path: string;
  /** Thư mục còn tồn tại trên máy hay không */
  exists: boolean;
  isGit: boolean;
  /** Các worktree phụ: thư mục riêng trên nhánh riêng của cùng repo */
  worktrees: Worktree[];
}

export interface Worktree {
  path: string;
  branch: string | null;
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Lỗi máy chủ (${res.status})`);
  return body as T;
}

export interface DirListing {
  path: string;
  parent: string | null;
  home: string;
  isRepo: boolean;
  dirs: { name: string; path: string; isRepo: boolean }[];
}

export const fsApi = {
  /** Liệt kê thư mục con; bỏ trống = thư mục home */
  browse: (dir?: string) =>
    request<DirListing>(`/api/fs/dirs${dir ? `?path=${encodeURIComponent(dir)}` : ''}`),
};

export const reposApi = {
  list: () => request<{ home: string; repos: Repo[] }>('/api/repos'),
  /** Lưu theo đường dẫn, hoặc theo thư mục hiện tại của một phiên terminal */
  add: (target: { path: string } | { sessionId: string }) =>
    request<{ repo: Repo; created: boolean }>('/api/repos', {
      method: 'POST',
      body: JSON.stringify(target),
    }),
  remove: (id: string) => request<null>(`/api/repos/${id}`, { method: 'DELETE' }),
  addWorktree: (id: string, branch: string) =>
    request<{ worktree: Worktree; repo: Repo }>(`/api/repos/${id}/worktrees`, {
      method: 'POST',
      body: JSON.stringify({ branch }),
    }),
  removeWorktree: (id: string, path: string) =>
    request<{ repo: Repo }>(`/api/repos/${id}/worktrees`, {
      method: 'DELETE',
      body: JSON.stringify({ path }),
    }),
};
