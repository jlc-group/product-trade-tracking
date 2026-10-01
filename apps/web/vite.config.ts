import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin API in dev so the session cookie just works (apps/api listens on :3000).
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
})
