import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// Backend port follows the Makefile's PORT (passed as BACKEND_PORT); defaults to 8200.
const backendPort = process.env.BACKEND_PORT ?? '8200';

// External-access debug mode is driven by the Makefile (USE_BFTORCH_DEBUG=true),
// which exports these for us:
//   BFTORCH_DEBUG=1            -> listen on all interfaces so the LAN can reach us
//   BFTORCH_HTTPS=1            -> backend (and we) speak HTTPS via a self-signed cert
//   BFTORCH_TLS_CERT/KEY=path  -> the self-signed material to load for our HTTPS
const debug = process.env.BFTORCH_DEBUG === '1';
const https = process.env.BFTORCH_HTTPS === '1';
const certPath = process.env.BFTORCH_TLS_CERT;
const keyPath = process.env.BFTORCH_TLS_KEY;

// Serve Vite over the same self-signed cert when the backend uses HTTPS, so the
// browser↔frontend hop matches the frontend↔backend hop (no mixed content).
const httpsOption =
  https && certPath && keyPath
    ? { cert: readFileSync(certPath), key: readFileSync(keyPath) }
    : undefined;

// Proxy targets must match how the backend is actually listening. When the
// backend is HTTPS with a self-signed cert, `secure: false` tells the proxy to
// accept it instead of rejecting the untrusted chain.
const httpProto = https ? 'https' : 'http';
const wsProto = https ? 'wss' : 'ws';

export default defineConfig({
  server: {
    // `true` binds 0.0.0.0 (all interfaces); otherwise loopback-only.
    host: debug ? true : 'localhost',
    port: 5173,
    https: httpsOption,
    proxy: {
      '/api': {
        target: `${httpProto}://127.0.0.1:${backendPort}`,
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: `${wsProto}://127.0.0.1:${backendPort}`,
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
