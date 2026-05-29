import { defineConfig } from 'vite';

// Backend port follows the Makefile's PORT (passed as BACKEND_PORT); defaults to 8200.
const backendPort = process.env.BACKEND_PORT ?? '8200';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://127.0.0.1:${backendPort}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
