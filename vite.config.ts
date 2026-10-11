import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/static/' : '/',
  build: { outDir: 'doneproof/static', emptyOutDir: true },
  server: {
    proxy: {
      '/verify': 'http://127.0.0.1:8000',
      '/api': 'http://127.0.0.1:8000',
    },
  },
}))
