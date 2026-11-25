import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import express, { Router } from 'express';

// Trình duyệt không cho trang web biết đường dẫn thật của file được kéo thả. Server chạy trên
// chính máy này nên thử tìm lại file gốc trước (/locate); không tìm ra thì trang mới gửi nội dung
// file lên, server lưu thành file tạm rồi trả đường dẫn để chèn vào terminal.

const run = promisify(execFile);

const UPLOAD_DIR = path.join(os.tmpdir(), 'web-tool-uploads');
const MAX_SIZE = '200mb';

/** Giữ chữ, số, chấm, gạch; bỏ mọi thứ có thể thành dấu ngăn thư mục hoặc ký tự đặc biệt của shell. */
function safeName(raw: string): string {
  const base = path.basename(raw.normalize('NFC')).replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^\.+/, '');
  return base.slice(-120) || 'file';
}

/**
 * Tìm file gốc trên máy bằng Spotlight: khớp tên + dung lượng, rồi đối chiếu thời điểm sửa.
 * Chỉ trả về khi có đúng một file khớp; không chắc thì để trang gửi bản sao lên như cũ.
 */
async function locate(name: string, size: number, mtime: number): Promise<string | null> {
  if (process.platform !== 'darwin') return null;
  const quoted = name.replace(/[\\"]/g, '\\$&');
  const names = new Set([quoted.normalize('NFC'), quoted.normalize('NFD')]);
  const query = `(${[...names].map((n) => `kMDItemFSName == "${n}"`).join(' || ')}) && kMDItemFSSize == ${size}`;
  let stdout: string;
  try {
    ({ stdout } = await run('mdfind', [query], { timeout: 3000, maxBuffer: 4 * 1024 * 1024 }));
  } catch {
    return null;
  }
  const matches: string[] = [];
  for (const candidate of stdout.split('\n').filter(Boolean).slice(0, 200)) {
    const info = await stat(candidate).catch(() => null);
    if (info?.isFile() && info.size === size && Math.abs(info.mtimeMs - mtime) < 1.5) matches.push(candidate);
  }
  return matches.length === 1 ? matches[0] : null;
}

export function createUploadsRouter(): Router {
  const router = Router();

  router.get('/locate', async (req, res) => {
    const name = typeof req.query.name === 'string' ? req.query.name : '';
    const size = Number(req.query.size);
    const mtime = Number(req.query.mtime);
    if (!name || name.includes('/') || !Number.isSafeInteger(size) || size <= 0 || !Number.isFinite(mtime)) {
      res.status(400).json({ error: 'Thiếu thông tin file' });
      return;
    }
    const found = await locate(name, size, mtime);
    if (found) res.json({ path: found });
    else res.status(404).json({ error: 'Không tìm thấy file gốc' });
  });

  router.post('/', express.raw({ type: () => true, limit: MAX_SIZE }), async (req, res) => {
    const body: unknown = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: 'File rỗng hoặc không đọc được' });
      return;
    }
    const name = safeName(typeof req.query.name === 'string' ? req.query.name : '');
    // Mỗi file một thư mục con ngẫu nhiên: giữ nguyên tên gốc mà không đè lên file trùng tên
    const dir = path.join(UPLOAD_DIR, randomBytes(4).toString('hex'));
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const target = path.join(dir, name);
    await writeFile(target, body, { mode: 0o600 });
    res.json({ path: target });
  });

  return router;
}
