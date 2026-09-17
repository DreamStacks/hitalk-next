import { env } from 'cloudflare:workers'
import { applyD1Migrations } from 'cloudflare:test'
import { beforeAll, beforeEach } from 'vitest'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DROP TRIGGER IF EXISTS forced_failure'),
    env.DB.prepare('DELETE FROM comment_likes'),
    env.DB.prepare('DELETE FROM comments'),
    env.DB.prepare('DELETE FROM pages'),
    env.DB.prepare("DELETE FROM sqlite_sequence WHERE name = 'pages'"),
  ])
})
