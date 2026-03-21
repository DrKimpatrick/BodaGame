import path from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  server: {
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@game': path.resolve(__dirname, 'src/game'),
    },
  },
})
