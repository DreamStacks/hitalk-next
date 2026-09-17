import { beforeAll, afterAll, test } from 'vitest'
import assert from 'node:assert/strict'
import { startWorker } from './helpers/worker.mjs'
import { verifyBackup } from '../scripts/verify-backup.mjs'

let worker
beforeAll(async () => {
  worker = await startWorker()
})
afterAll(async () => {
  await worker?.dispose()
})

test('Wrangler migrations, HTTP API, concurrent likes, cascades and exported backup round trip', async () => {
  async function request(path, options = {}, expected = 200) {
    const response = await fetch(worker.url + path, {
      ...options,
      signal: AbortSignal.timeout(10000),
    })
    const body = await response.json()
    assert.equal(response.status, expected, JSON.stringify(body))
    return body
  }
  const post = body =>
    request(
      '/comments',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      201
    )
  const root = await post({
    path: '/runtime',
    nick: 'Reader',
    email: 'reader@example.invalid',
    content: '**hello**',
  })
  await post({
    path: '/runtime',
    nick: 'Reply',
    content: 'reply',
    parent_id: root.id,
  })
  const likes = await Promise.all(
    Array.from({ length: 8 }, () =>
      request(`/comments/${root.id}/like`, { method: 'POST' })
    )
  )
  assert.equal(likes.filter(result => result.success).length, 1)
  assert.ok(likes.every(result => result.like_count === 1))
  const list = await request('/comments?path=/runtime&pageSize=1')
  assert.equal(list.total, 2)
  assert.equal(list.comments[0].children.length, 1)
  assert.ok(!('email' in list.comments[0]))
  await request('/admin/api/comments', {}, 401)
  await request('/comments', { method: 'POST', body: 'x'.repeat(140000) }, 413)
  await request(`/comments/${root.id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer local-test-admin' },
  })
  assert.equal((await request('/comments?path=/runtime')).total, 0)
  const kept = await post({
    path: '/backup',
    nick: 'Reader',
    content: 'preserved',
  })
  await post({
    path: '/backup',
    nick: 'Reply',
    content: 'preserved reply',
    parent_id: kept.id,
  })
  await request(`/comments/${kept.id}/like`, { method: 'POST' })
  const restored = verifyBackup(await worker.exportBackup())
  assert.deepEqual(restored, { pages: 2, comments: 2, comment_likes: 1 })
})
