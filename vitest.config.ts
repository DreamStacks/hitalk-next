import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'

export default defineConfig(async () => ({
  test: {
    restoreMocks: true,
    coverage: {
      provider: 'istanbul',
      thresholds: { lines: 85, statements: 80, functions: 80, branches: 60 },
      include: [
        'apps/server/src/**/*.ts',
        'packages/sdk/src/**/*.ts',
        'packages/shared/**/*.ts',
      ],
      exclude: ['**/types.ts', '**/emojis.ts'],
      reporter: ['text', 'html', 'json-summary'],
    },
    projects: [
      {
        test: {
          name: 'node',
          include: ['tests/backup.test.mjs', 'tests/sdk.test.mjs'],
          restoreMocks: true,
        },
      },
      {
        plugins: [
          cloudflareTest({
            remoteBindings: false,
            miniflare: {
              compatibilityDate: '2026-09-16',
              compatibilityFlags: ['nodejs_compat'],
              d1Databases: ['DB'],
              bindings: {
                ADMIN_TOKEN: 'test-admin',
                IP_HASH_SALT: 'test-ip-salt',
                TEST_MIGRATIONS: await readD1Migrations(
                  './apps/server/migrations'
                ),
              },
            },
          }),
        ],
        test: {
          name: 'workers',
          include: ['tests/server.test.mjs'],
          setupFiles: ['tests/setup-worker.mjs'],
          restoreMocks: true,
        },
      },
    ],
  },
}))
