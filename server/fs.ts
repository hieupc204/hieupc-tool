import { access, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Router } from 'express';
import { normalizePath } from './repos.ts';
import { isDirectory } from './terminal.ts';

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

const isGitRepo = (dir: string) => exists(path.join(dir, '.git'));

/** Duyệt thư mục trên máy để chọn repo ngay trong trang (trình duyệt không cho biết đường dẫn thật). */
export function createFsRouter(): Router {
  const router = Router();

  router.get('/dirs', async (req, res) => {
    const raw = typeof req.query.path === 'string' && req.query.path.trim() ? req.query.path : os.homedir();
    const dir = normalizePath(raw);

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      const reason =
        code === 'ENOENT' || code === 'ENOTDIR'
          ? 'Không tìm thấy thư mục'
          : code === 'EACCES' || code === 'EPERM'
            ? 'Không có quyền đọc thư mục'
            : 'Không đọc được thư mục';
      res.status(400).json({ error: `${reason} ${dir}` });
      return;
    }

    const candidates = entries.filter((e) => !e.name.startsWith('.') && (e.isDirectory() || e.isSymbolicLink()));
    const dirs = (
      await Promise.all(
        candidates.map(async (entry) => {
          const full = path.join(dir, entry.name);
          if (entry.isSymbolicLink() && !(await isDirectory(full))) return null;
          return { name: entry.name, path: full, isRepo: await isGitRepo(full) };
        }),
      )
    )
      .filter((d) => d !== null)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const parent = path.dirname(dir);
    res.json({
      path: dir,
      parent: parent === dir ? null : parent,
      home: os.homedir(),
      isRepo: await isGitRepo(dir),
      dirs,
    });
  });

  return router;
}
