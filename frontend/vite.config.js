import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'   // NEW

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],       // NEW: added tailwindcss()
})
