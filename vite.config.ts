import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('./examples/playground', import.meta.url)),
  publicDir: false,
  // Relative assets work on both /hitalk-next/ (GitHub Pages) and a custom domain.
  base: './',
  build: {
    outDir: fileURLToPath(new URL('./dist/web', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
      },
    },
    fs: {
      // Preserve Vite's defaults and keep Wrangler secrets/local databases private.
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem}',
        '**/.git/**',
        '**/.dev.vars*',
        '**/.wrangler/**',
      ],
    },
  },
})
