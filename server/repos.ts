import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { addWorktree, getGitInfo, removeWorktree } from './git.ts';
import { getSessionCwd, isDirectory } from './terminal.ts';

interface Repo {
  id: string;
  name: string;
  path: string;
}

// Danh sách repo đã lưu nằm trong data/repos.json (không đưa vào git)
const DATA_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/repos.json');

async function readRepos(): Promise<Repo[]> {
  try {
    const parsed = JSON.parse(await readFile(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function writeRepos(repos: Repo[]): Promise<void> {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  await writeFile(tmp, `${JSON.stringify(repos, null, 2)}\n`);
  await rename(tmp, DATA_FILE);
}

/** Chấp nhận đường dẫn dán vào: có dấu nháy, `~`, dấu / ở cuối. */
export function normalizePath(input: string): string {
  let p = input.trim().replace(/^(['"])(.*)\1$/, '$2');
  if (p === '~' || p.startsWith('~/')) p = path.join(os.homedir(), p.slice(1));
  return path.resolve(p);
}

async function withStatus(repos: Repo[]) {
  const sorted = [...repos].sort((a, b) => a.name.localeCompare(b.name));
  return Promise.all(sorted.map(describe));
}

/** Thêm thông tin đọc từ ổ đĩa: thư mục còn không, có phải repo git không, các worktree phụ. */
async function describe(repo: Repo) {
  const exists = await isDirectory(repo.path);
  const gitInfo = exists ? await getGitInfo(repo.path) : { isGit: false, worktrees: [] };
  return { ...repo, exists, ...gitInfo };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function createReposRouter(): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({ home: os.homedir(), repos: await withStatus(await readRepos()) });
  });

  // Lưu theo đường dẫn ({ path }) hoặc theo thư mục hiện tại của một phiên terminal ({ sessionId })
  router.post('/', async (req, res) => {
    const { path: rawPath, sessionId, name } = (req.body ?? {}) as Record<string, unknown>;

    let dir: string | null = null;
    if (typeof sessionId === 'string') {
      dir = await getSessionCwd(sessionId);
      if (!dir) {
        res.status(400).json({ error: 'Không đọc được thư mục hiện tại của terminal này' });
        return;
      }
    } else if (typeof rawPath === 'string' && rawPath.trim()) {
      dir = normalizePath(rawPath);
    }
    if (!dir) {
      res.status(400).json({ error: 'Thiếu đường dẫn thư mục' });
      return;
    }
    if (!(await isDirectory(dir))) {
      res.status(400).json({ error: `Không tìm thấy thư mục ${dir}` });
      return;
    }

    const repos = await readRepos();
    let repo = repos.find((r) => r.path === dir);
    const created = !repo;
    if (!repo) {
      const label = typeof name === 'string' && name.trim() ? name.trim() : path.basename(dir) || dir;
      repo = { id: randomUUID(), name: label, path: dir };
      await writeRepos([...repos, repo]);
    }
    res.status(created ? 201 : 200).json({ repo: await describe(repo), created });
  });

  router.delete('/:id', async (req, res) => {
    const repos = await readRepos();
    const remaining = repos.filter((r) => r.id !== req.params.id);
    if (remaining.length !== repos.length) await writeRepos(remaining);
    res.status(204).end();
  });

  // Tạo worktree: một thư mục riêng trên một nhánh riêng, để chạy thêm agent mà không giẫm lên nhau
  router.post('/:id/worktrees', async (req, res) => {
    const repo = (await readRepos()).find((r) => r.id === req.params.id);
    const branch = typeof req.body?.branch === 'string' ? req.body.branch.trim() : '';
    if (!repo || !branch) {
      res.status(400).json({ error: repo ? 'Thiếu tên nhánh' : 'Không tìm thấy repo' });
      return;
    }
    try {
      const worktree = await addWorktree(repo.path, branch);
      res.status(201).json({ worktree, repo: await describe(repo) });
    } catch (err) {
      res.status(400).json({ error: errorText(err) });
    }
  });

  router.delete('/:id/worktrees', async (req, res) => {
    const repo = (await readRepos()).find((r) => r.id === req.params.id);
    const worktreePath = typeof req.body?.path === 'string' ? req.body.path : '';
    if (!repo || !worktreePath) {
      res.status(400).json({ error: repo ? 'Thiếu đường dẫn worktree' : 'Không tìm thấy repo' });
      return;
    }
    try {
      await removeWorktree(repo.path, worktreePath);
      res.json({ repo: await describe(repo) });
    } catch (err) {
      res.status(400).json({ error: errorText(err) });
    }
  });

  return router;
}
