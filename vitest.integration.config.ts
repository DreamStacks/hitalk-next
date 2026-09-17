import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    include: ['tests/*.integration.test.mjs'],
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
})
