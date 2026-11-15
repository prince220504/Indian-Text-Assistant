import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'   // NEW

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],       // NEW: added tailwindcss()
  server: {
    host: true,   // listen on the Wi-Fi address too, so a phone on the same network can open it
    // the browser calls /api/..., Vite forwards it to the backend on this PC.
    // Same origin for the browser -> no CORS change, and the backend never leaves localhost.
    proxy: {
      '/api': { target: 'http://localhost:8000', rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
})
