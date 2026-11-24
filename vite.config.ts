import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_PORT = Number(process.env.PORT) || 3001;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': `http://127.0.0.1:${API_PORT}`,
      '/ws': { target: `ws://127.0.0.1:${API_PORT}`, ws: true },
    },
  },
});
