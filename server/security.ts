import type { IncomingMessage } from 'node:http';
import type { NextFunction, Request, Response } from 'express';

// Tool này mở shell và đọc/ghi dữ liệu trên máy, nên mọi yêu cầu phải đến từ chính
// trang này trên loopback. Chặn website lạ gọi vào localhost và DNS rebinding.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLoopback(urlLike: string | undefined): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(urlLike ?? '').hostname);
  } catch {
    return false;
  }
}

// Host chặn DNS rebinding; Origin do trình duyệt tự gắn nên trang lạ không giả được.
// Không so khớp chính xác Host với Origin vì proxy của Vite lúc dev đổi Host thành
// địa chỉ đích; hệ quả là mọi trang chạy trên localhost của máy này đều được tin.
const isLoopbackHost = (req: IncomingMessage) => isLoopback(`http://${req.headers.host}`);
const isLoopbackOrigin = (req: IncomingMessage) => isLoopback(req.headers.origin);

/** Dùng cho WebSocket: trình duyệt luôn gửi Origin khi mở WebSocket. */
export function isTrustedOrigin(req: IncomingMessage): boolean {
  return isLoopbackHost(req) && isLoopbackOrigin(req);
}

/** Dùng cho /api: GET cùng origin có thể không kèm Origin, còn yêu cầu ghi thì bắt buộc. */
export function apiGuard(req: Request, res: Response, next: NextFunction): void {
  const isRead = req.method === 'GET' || req.method === 'HEAD';
  const originOk = req.headers.origin ? isLoopbackOrigin(req) : isRead;
  if (!isLoopbackHost(req) || !originOk) {
    res.status(403).json({ error: 'Yêu cầu không đến từ trang web tool trên máy này' });
    return;
  }
  next();
}
