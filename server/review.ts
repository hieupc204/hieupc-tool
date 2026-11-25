import { execFile } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { Router } from 'express';
import { gitErrorMessage } from './git.ts';
import { getSessionCwd, isDirectory } from './terminal.ts';

// Xem lại thay đổi chưa commit của repo mà terminal đang đứng. Chỉ đọc, không sửa gì trong repo.

const execFileAsync = promisify(execFile);

const MAX_FILES = 500;
const MAX_DIFF_BYTES = 2 * 1024 * 1024;
/** File mới lớn hơn mức này thì không đếm số dòng */
const MAX_COUNT_BYTES = 1024 * 1024;
/** Đường dẫn mà git hiểu là "không có file" ở cả hai hệ điều hành */
const NO_FILE = '/dev/null';

async function git(cwd: string, args: string[], maxBuffer = 16 * 1024 * 1024): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    timeout: 20_000,
    maxBuffer,
    env: {
      ...process.env,
      // Không giành khoá index với agent đang chạy git trong cùng repo
      GIT_OPTIONAL_LOCKS: '0',
      // Tên file có * hay [ ] vẫn được hiểu đúng nguyên văn
      GIT_LITERAL_PATHSPECS: '1',
    },
  });
  return stdout;
}

export interface ChangedFile {
  path: string;
  /** Tên cũ, khi file được đổi tên */
  oldPath?: string;
  /** Chữ cái trạng thái của git: M sửa, A thêm, D xoá, R đổi tên, U xung đột… `?` = file mới chưa git add */
  status: string;
  /** null = file nhị phân hoặc không đếm được */
  additions: number | null;
  deletions: number | null;
  /** Đổi mỗi khi nội dung file trên đĩa đổi */
  version: string;
}

async function repoRoot(dir: string): Promise<string | null> {
  try {
    return (await git(dir, ['rev-parse', '--show-toplevel'])).replace(/\n$/, '') || null;
  } catch {
    return null;
  }
}

/** Mốc để so sánh: commit hiện tại, hoặc cây rỗng nếu repo chưa có commit nào */
async function baseOf(root: string): Promise<string> {
  try {
    return (await git(root, ['rev-parse', '--verify', '--quiet', 'HEAD'])).trim();
  } catch {
    return (await git(root, ['hash-object', '-t', 'tree', NO_FILE])).trim();
  }
}

async function branchOf(root: string): Promise<string | null> {
  try {
    return (await git(root, ['symbolic-ref', '--short', '--quiet', 'HEAD'])).trim() || null;
  } catch {
    return null;
  }
}

async function versionOf(root: string, file: string): Promise<string> {
  const info = await lstat(path.join(root, file)).catch(() => null);
  return info ? `${info.mtimeMs}:${info.size}` : 'deleted';
}

async function countNewLines(root: string, file: string): Promise<number | null> {
  const full = path.join(root, file);
  const info = await lstat(full).catch(() => null);
  if (!info?.isFile() || info.size > MAX_COUNT_BYTES) return null;
  const content = await readFile(full).catch(() => null);
  if (!content || content.subarray(0, 8000).includes(0)) return null;
  const text = content.toString('utf8');
  if (!text) return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

const DIFF_FLAGS = ['--no-ext-diff', '--no-textconv', '--no-color', '--find-renames'];

async function listChanges(root: string) {
  const base = await baseOf(root);
  const [branch, nameStatus, numstat, untracked] = await Promise.all([
    branchOf(root),
    git(root, ['diff', ...DIFF_FLAGS, '--name-status', '-z', base]),
    git(root, ['diff', ...DIFF_FLAGS, '--numstat', '-z', base]),
    git(root, ['ls-files', '--others', '--exclude-standard', '-z']),
  ]);

  // numstat -z: "thêm\txoá\ttên\0", riêng đổi tên là "thêm\txoá\t\0tên cũ\0tên mới\0"
  const counts = new Map<string, [number | null, number | null]>();
  const num = numstat.split('\0');
  for (let i = 0; i < num.length; i++) {
    if (!num[i]) continue;
    const [add, del, ...rest] = num[i].split('\t');
    let name = rest.join('\t');
    if (!name) {
      name = num[i + 2];
      i += 2;
    }
    const toCount = (n: string) => (n === '-' ? null : Number(n));
    counts.set(name, [toCount(add), toCount(del)]);
  }

  // name-status -z: "M\0tên\0", riêng đổi tên/sao chép là "R100\0tên cũ\0tên mới\0"
  const found = new Map<string, Pick<ChangedFile, 'path' | 'oldPath' | 'status'>>();
  const names = nameStatus.split('\0');
  for (let i = 0; i + 1 < names.length; ) {
    const status = names[i][0];
    const renamed = status === 'R' || status === 'C';
    const file = renamed ? names[i + 2] : names[i + 1];
    // File đang xung đột được git liệt kê hai lần (U rồi M): giữ lần đầu
    if (!found.has(file)) found.set(file, { path: file, status, ...(renamed && { oldPath: names[i + 1] }) });
    i += renamed ? 3 : 2;
  }
  for (const file of untracked.split('\0')) {
    if (file && !found.has(file)) found.set(file, { path: file, status: '?' });
  }

  const all = [...found.values()].sort((a, b) => a.path.localeCompare(b.path));
  const files: ChangedFile[] = await Promise.all(
    all.slice(0, MAX_FILES).map(async (entry) => {
      const [additions, deletions] =
        entry.status === '?' ? [await countNewLines(root, entry.path), 0] : (counts.get(entry.path) ?? [null, null]);
      return { ...entry, additions, deletions, version: await versionOf(root, entry.path) };
    }),
  );
  return { root, branch, base, files, total: all.length };
}

async function fileDiff(root: string, file: string, oldPath: string | null): Promise<string> {
  const untracked = await git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', file]);
  if (untracked.split('\0').includes(file)) {
    // Thư mục là một repo git khác nằm bên trong: git không liệt kê nội dung bên trong
    if (file.endsWith('/')) return '';
    try {
      return await git(root, ['diff', ...DIFF_FLAGS, '--no-index', '--', NO_FILE, file], MAX_DIFF_BYTES);
    } catch (err) {
      // --no-index thoát với mã 1 khi có khác biệt, đó là kết quả bình thường
      const { code, stdout } = err as { code?: unknown; stdout?: string };
      if (code === 1 && typeof stdout === 'string') return stdout;
      throw err;
    }
  }
  const base = await baseOf(root);
  return git(root, ['diff', ...DIFF_FLAGS, base, '--', ...(oldPath ? [oldPath] : []), file], MAX_DIFF_BYTES);
}

/** Đường dẫn tương đối nằm trong repo; không cho trỏ ra ngoài bằng .. hay đường dẫn tuyệt đối */
function isInside(root: string, file: string): boolean {
  const relative = path.relative(root, path.resolve(root, file));
  return Boolean(relative) && !path.isAbsolute(file) && relative.split(path.sep)[0] !== '..';
}

const asString = (value: unknown) => (typeof value === 'string' && value ? value : null);

export function createReviewRouter(): Router {
  const router = Router();

  // Thư mục lấy theo chỗ shell đang đứng (?sessionId), không có thì theo ?path
  router.get('/', async (req, res) => {
    const sessionId = asString(req.query.sessionId);
    const dir = (sessionId && (await getSessionCwd(sessionId))) || asString(req.query.path);
    if (!dir || !(await isDirectory(dir))) {
      res.json({ root: null });
      return;
    }
    const root = await repoRoot(dir);
    if (!root) {
      res.json({ root: null, dir });
      return;
    }
    try {
      res.json(await listChanges(root));
    } catch (err) {
      res.status(500).json({ error: gitErrorMessage(err) });
    }
  });

  router.get('/file', async (req, res) => {
    const root = asString(req.query.root);
    const file = asString(req.query.file);
    const oldPath = asString(req.query.oldPath);
    if (!root || !file || !isInside(root, file) || (oldPath && !isInside(root, oldPath))) {
      res.status(400).json({ error: 'Thiếu hoặc sai đường dẫn file' });
      return;
    }
    if (!(await isDirectory(root)) || (await repoRoot(root)) === null) {
      res.status(400).json({ error: 'Không phải repo git' });
      return;
    }
    try {
      res.json({ diff: await fileDiff(root, file, oldPath) });
    } catch (err) {
      const tooLarge = (err as { code?: unknown }).code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
      res.status(tooLarge ? 413 : 500).json({
        error: tooLarge ? 'Thay đổi quá lớn (trên 2MB) nên không hiển thị ở đây' : gitErrorMessage(err),
      });
    }
  });

  return router;
}
