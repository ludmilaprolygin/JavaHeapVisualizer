import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const shared = fileURLToPath(new URL('../shared', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@shared': shared },
  },
  server: {
    // Permite importar ../shared (ejemplos de trazas) desde el dev server.
    fs: { allow: ['.', shared] },
    // El backend (Javalin) va a escuchar en 7070.
    proxy: { '/api': 'http://localhost:7070' },
  },
})
