import { rm } from 'node:fs/promises'

// Only generated outputs; local databases, secrets and dependencies are retained.
for (const path of [
  'dist/',
  'packages/sdk/dist/',
  'apps/server/dist/',
  'coverage/',
]) {
  await rm(new URL(`../${path}`, import.meta.url), {
    recursive: true,
    force: true,
  })
}
console.log('Removed generated build and coverage outputs.')
