import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiTarget = process.env.TTT_API_PROXY ?? 'http://127.0.0.1:3000';
const cursorTarget = process.env.TTT_CURSOR_PROXY ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
      },
      '/socket.io': {
        target: apiTarget,
        changeOrigin: false,
        ws: true,
      },
      '/cursor.io': {
        target: cursorTarget,
        changeOrigin: false,
        ws: true,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
