import { test } from 'vitest'
import assert from 'node:assert/strict'
import { startWorker } from './helpers/worker.mjs'
import { verifyBackup } from '../scripts/verify-backup.mjs'
test('Wrangler fresh migration, credential replay, flat replies and backup round trip', async t => {
  const worker = await startWorker()
  t.onTestFinished(() => worker.dispose())
  const token = 'ht_' + 'C'.repeat(43)
  const call = (path, method = 'GET', body) => {
    const request = new Request(worker.url + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return fetch(request)
  }
  const body = {
    path: '/integration',
    nick: 'Reader',
    content: 'hello',
    client_request_id: crypto.randomUUID(),
  }
  const responses = await Promise.all(
    Array.from({ length: 5 }, () => call('/api/comments', 'POST', body))
  )
  for (const res of responses)
    assert.equal(res.status, 201, await res.clone().text())
  const root = await responses[0].json()
  const childResponse = await call('/api/comments', 'POST', {
    ...body,
    client_request_id: crypto.randomUUID(),
    reply_to_id: root.id,
  })
  assert.equal(childResponse.status, 201, await childResponse.clone().text())
  const child = await childResponse.json()
  const likes = await Promise.all(
    Array.from({ length: 5 }, () =>
      call(`/api/comments/${child.id}/like`, 'PUT')
    )
  )
  for (const res of likes) assert.equal(res.status, 200)
  let data = await (await call('/api/comments?path=/integration')).json()
  assert.equal(data.total, 2)
  assert.equal(data.comments[0].replies[0].like_count, 1)
  assert.equal((await call(`/api/comments/${root.id}`, 'DELETE')).status, 200)
  data = await (await call('/api/comments?path=/integration')).json()
  assert.equal(data.total, 1)
  assert.equal(data.comments[0].deleted, true)
  const stats = verifyBackup(await worker.exportBackup())
  assert.equal(stats.comments, 2)
  assert.equal(stats.comment_likes, 1)
})
