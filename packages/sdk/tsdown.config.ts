import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { hitalk: 'src/index.ts' },
  platform: 'neutral',
  // Lit's Node condition keeps ESM importable during SSR and still renders in browsers.
  inputOptions: { resolve: { conditionNames: ['node', 'import', 'default'] } },
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
    alwaysBundle: ['@hitalk/shared', 'valibot', /^lit-html(?:\/|$)/],
    onlyBundle: ['valibot', 'lit-html'],
  },
  sourcemap: true,
  minify: true,
  css: { fileName: 'hitalk.css', minify: true },
})
