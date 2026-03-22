import path from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('@react-three/fiber')) return 'r3f'
          if (id.includes('@react-three/drei')) return 'drei'
          if (id.includes('@react-three/rapier')) return 'rapier'
          if (id.includes('node_modules/zustand')) return 'zustand'
        },
      },
    },
  },
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
