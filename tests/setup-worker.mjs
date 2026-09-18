import { env } from 'cloudflare:workers'
import { applyD1Migrations } from 'cloudflare:test'
import { beforeAll, beforeEach } from 'vitest'
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})
beforeEach(async () => {
  await env.DB.batch(
    [
      'notification_jobs',
      'email_suppressions',
      'moderation_actions',
      'comment_likes',
      'comments',
      'pages',
    ].map(table => env.DB.prepare(`DELETE FROM ${table}`))
  )
  await env.DB.prepare("DELETE FROM identities WHERE kind='visitor'").run()
})
