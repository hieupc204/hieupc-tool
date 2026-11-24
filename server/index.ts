import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createFsRouter } from './fs.ts';
import { createReposRouter } from './repos.ts';
import { apiGuard } from './security.ts';
import { attachTerminal } from './terminal.ts';

// Mặc định chỉ nghe trên loopback: tool này mở shell nên không được lộ ra mạng.
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 3001;

const app = express();

app.use('/api', apiGuard, express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/repos', createReposRouter());
app.use('/api/fs', createFsRouter());

// Production: phục vụ bản build của Vite. Khi dev thì Vite tự phục vụ và proxy sang đây.
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (process.env.NODE_ENV === 'production' && existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

const server = createServer(app);
attachTerminal(server);

server.listen(PORT, HOST, () => {
  console.log(`[server] http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}`);
});
