import { execFile } from 'node:child_process';
import { access, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Luôn gọi git bằng execFile (không qua shell) nên tên nhánh không thể chèn lệnh
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, timeout: 20_000 });
  return stdout;
}

/** Lấy thông báo lỗi của git để hiện cho người dùng. */
export function gitErrorMessage(err: unknown): string {
  const stderr = (err as { stderr?: string }).stderr?.trim();
  return stderr || (err instanceof Error ? err.message : String(err));
}

export interface Worktree {
  path: string;
  /** null khi worktree không nằm trên nhánh nào (detached HEAD) */
  branch: string | null;
}

export interface GitInfo {
  isGit: boolean;
  /** Các worktree phụ của repo. Chỉ liệt kê khi thư mục này là worktree chính. */
  worktrees: Worktree[];
}

const sameDir = async (a: string, b: string) => {
  try {
    return (await realpath(a)) === (await realpath(b));
  } catch {
    return false;
  }
};

export async function getGitInfo(repoPath: string): Promise<GitInfo> {
  let output: string;
  try {
    output = await git(repoPath, ['worktree', 'list', '--porcelain']);
  } catch {
    return { isGit: false, worktrees: [] };
  }

  const entries = output
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      const value = (key: string) => lines.find((l) => l.startsWith(`${key} `))?.slice(key.length + 1);
      return {
        path: value('worktree') ?? '',
        branch: value('branch')?.replace(/^refs\/heads\//, '') ?? null,
        bare: lines.includes('bare'),
      };
    })
    .filter((entry) => entry.path && !entry.bare);

  // Mục đầu tiên là worktree chính
  const isMain = entries.length > 0 && (await sameDir(entries[0].path, repoPath));
  return {
    isGit: true,
    worktrees: isMain ? entries.slice(1).map(({ path: p, branch }) => ({ path: p, branch })) : [],
  };
}

/**
 * Tạo worktree cho nhánh `branch` (tạo nhánh mới từ HEAD nếu chưa có), đặt ở thư mục
 * anh em `<tên-repo>.worktrees/<nhánh>` để không lẫn vào trong repo.
 */
export async function addWorktree(repoPath: string, branch: string): Promise<Worktree> {
  if (branch.startsWith('-')) throw new Error('Tên nhánh không hợp lệ');
  try {
    await git(repoPath, ['check-ref-format', '--branch', branch]);
  } catch {
    throw new Error(`Tên nhánh không hợp lệ: ${branch}`);
  }

  const slug = branch.replace(/[^\w.-]+/g, '-');
  const dir = path.join(path.dirname(repoPath), `${path.basename(repoPath)}.worktrees`, slug);
  const dirExists = await access(dir).then(
    () => true,
    () => false,
  );
  if (dirExists) throw new Error(`Thư mục ${dir} đã tồn tại`);

  const branchExists = await git(repoPath, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).then(
    () => true,
    () => false,
  );
  try {
    await git(repoPath, branchExists ? ['worktree', 'add', dir, branch] : ['worktree', 'add', '-b', branch, dir]);
  } catch (err) {
    throw new Error(gitErrorMessage(err));
  }
  return { path: dir, branch };
}

/**
 * Xoá thư mục worktree, giữ lại nhánh. Không dùng --force: git sẽ từ chối nếu trong đó
 * còn thay đổi chưa commit, để không mất việc đang làm dở.
 */
export async function removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
  const { worktrees } = await getGitInfo(repoPath);
  if (!worktrees.some((w) => w.path === worktreePath)) {
    throw new Error('Thư mục này không phải worktree của repo');
  }
  try {
    await git(repoPath, ['worktree', 'remove', worktreePath]);
  } catch (err) {
    throw new Error(gitErrorMessage(err));
  }
}
