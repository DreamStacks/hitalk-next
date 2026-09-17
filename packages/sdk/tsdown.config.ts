import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { hitalk: 'src/index.ts' },
  platform: 'browser',
  target: 'es2022',
  format: ['esm', 'iife'],
  globalName: 'Hitalk',
  outputOptions(options, format) {
    options.entryFileNames = chunk =>
      chunk.name.endsWith('.d')
        ? 'hitalk.d.ts'
        : format === 'es'
          ? 'hitalk.esm.js'
          : 'hitalk.js'
  },
  dts: { generator: 'tsgo', tsconfig: '../../tsconfig.sdk-build.json' },
  deps: {
    alwaysBundle: ['@hitalk/shared', 'valibot'],
    onlyBundle: ['valibot'],
  },
  sourcemap: true,
  minify: true,
  css: { fileName: 'hitalk.css', minify: true },
})
