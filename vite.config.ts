import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'

// https://vite.dev/config/
//
// Local dev against a local lantern-cloud API (run with API_LOCAL=1, which serves
// HTTPS on :8080 with a self-signed cert and bypasses Google auth). mkcert gives
// the dev server a locally-trusted cert, and the proxy forwards the API paths to
// the backend with `secure: false` so the browser never sees the self-signed cert
// or a cross-origin request. To use it, point the app at the dev origin via
// `VITE_API_URL=https://localhost:5173` (see .env.local).
//
// In production the app talks directly to the real API (VITE_API_URL = the
// canonical prod/staging host), so this proxy is dev-only and inert.
const API_TARGET = process.env.VITE_DEV_API_TARGET || 'https://localhost:8080'

export default defineConfig({
  plugins: [mkcert(), react()],
  server: {
    proxy: {
      // The dashboard backend lives under /v1; forward it (and the SSE stream)
      // to the local API. `secure: false` accepts the API's self-signed cert.
      '/v1': {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
