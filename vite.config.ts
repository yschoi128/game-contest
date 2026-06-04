import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        host: resolve(__dirname, 'src/host/index.html'),
        player: resolve(__dirname, 'src/player/index.html'),
        admin: resolve(__dirname, 'src/admin/index.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
});
