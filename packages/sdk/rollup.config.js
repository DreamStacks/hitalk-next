import { defineConfig } from 'rollup'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import postcss from 'rollup-plugin-postcss'

export default defineConfig({
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/hitalk.js',
      format: 'umd',
      name: 'Hitalk',
      sourcemap: true,
      exports: 'named',
    },
    {
      file: 'dist/hitalk.esm.js',
      format: 'es',
      sourcemap: true,
    },
  ],
  plugins: [
    resolve(),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
    }),
    postcss({
      extract: true,
      minimize: true,
    }),
  ],
})
