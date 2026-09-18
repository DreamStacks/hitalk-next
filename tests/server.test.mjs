import { test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { app } from '../apps/server/src/index.ts'
import { renderMarkdown } from '../apps/server/src/lib/markdown.ts'
import { clientInfo } from '../apps/server/src/lib/user-agent.ts'
import { processNotifications } from '../apps/server/src/services/notifications.ts'
import { digest } from '../apps/server/src/lib/auth.ts'
import { env as bindings } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
const token = 'ht_' + 'A'.repeat(43),
  other = 'ht_' + 'B'.repeat(43)
const admin = { Authorization: 'Bearer test-admin' }
function fixture(t, overrides = {}) {
  const env = { ...bindings, ...overrides }
  const context = createExecutionContext()
  t.onTestFinished(() => waitOnExecutionContext(context))
  const request = (path, init = {}) =>
    app.request('http://localhost' + path, init, env, context)
  const write = async (path, body, method = 'POST', auth = token) =>
    request(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  const input = (extra = {}) => ({
    path: '/article',
    nick: 'Reader',
    content: 'hello',
    client_request_id: crypto.randomUUID(),
    ...extra,
  })
  const create = async (extra = {}, auth = token) => {
    const res = await write('/api/comments', input(extra), 'POST', auth)
    assert.equal(res.status, 201, await res.clone().text())
    return res.json()
  }
  const list = async (path = '/article', auth) => {
    const res = await request(
      `/api/comments?path=${encodeURIComponent(path)}`,
      auth ? { headers: { Authorization: `Bearer ${auth}` } } : {}
    )
    assert.equal(res.status, 200, await res.clone().text())
    return res.json()
  }
  const moderate = (id, status) =>
    write(`/api/admin/comments/${id}`, { status }, 'PATCH', 'test-admin')
  return { env, db: env.DB, request, write, input, create, list, moderate }
}
test('public reads have no side effects; one API and safe errors', async t => {
  const f = fixture(t)
  assert.deepEqual((await f.list()).comments, [])
  assert.equal(
    (
      await f.db
        .prepare("SELECT COUNT(*) n FROM identities WHERE kind='visitor'")
        .first()
    ).n,
    0
  )
  assert.equal(
    (await f.db.prepare('SELECT COUNT(*) n FROM pages').first()).n,
    0
  )
  assert.equal((await f.request('/comments?path=/article')).status, 404)
  const res = await f.request('/api/comments?path=bad')
  assert.equal(res.status, 400)
  assert.equal((await res.json()).code, 'INVALID_INPUT')
  assert.equal(
    (await f.request('/api/comments?path=/article&limit=999')).status,
    400
  )
  assert.equal((await f.request('/api/comments/count')).status, 400)
})
test('first creation registers one hashed identity and never exposes private fields', async t => {
  const f = fixture(t)
  const c = await f.create({
    email: 'reader@example.com',
    website: 'https://example.com',
    notify: true,
  })
  assert.equal(c.can_delete, true)
  assert.equal(c.is_admin, false)
  const row = await f.db
    .prepare("SELECT * FROM identities WHERE kind='visitor'")
    .first()
  assert.equal(row.token_hash, await digest(token))
  assert.notEqual(row.token_hash, token)
  const response = JSON.stringify(await f.list())
  for (const value of [
    'reader@example.com',
    token,
    row.token_hash,
    'author_id',
    'request_hash',
    'content_md',
    'client_request_id',
  ])
    assert.ok(!response.includes(value), value)
  assert.equal((await f.list()).comments[0].can_delete, false)
  assert.equal((await f.list('/article', token)).comments[0].can_delete, true)
})
test('concurrent first submissions and replay share one identity and comment', async t => {
  const f = fixture(t)
  const body = f.input()
  const results = await Promise.all(
    Array.from({ length: 8 }, () => f.write('/api/comments', body))
  )
  for (const res of results)
    assert.equal(res.status, 201, await res.clone().text())
  assert.equal((await f.list()).total, 1)
  assert.equal(
    (
      await f.db
        .prepare("SELECT COUNT(*) n FROM identities WHERE kind='visitor'")
        .first()
    ).n,
    1
  )
  const conflict = await f.write('/api/comments', {
    ...body,
    content: 'different',
  })
  assert.equal(conflict.status, 409)
  const ids = await Promise.all(results.map(r => r.json()))
  assert.equal(new Set(ids.map(c => c.id)).size, 1)
})
test('invalid input and parent roll back the whole first write', async t => {
  const f = fixture(t)
  for (const body of [
    f.input({ path: '//evil' }),
    f.input({ website: 'javascript:alert(1)' }),
    f.input({ content: '' }),
    f.input({ client_request_id: 'bad' }),
    f.input({ reply_to_id: 'missing' }),
  ])
    assert.equal((await f.write('/api/comments', body)).status, 400)
  assert.equal(
    (await f.db.prepare('SELECT COUNT(*) n FROM pages').first()).n,
    0
  )
  assert.equal(
    (
      await f.db
        .prepare("SELECT COUNT(*) n FROM identities WHERE kind='visitor'")
        .first()
    ).n,
    0
  )
  assert.equal(
    (
      await f.request('/api/comments', {
        method: 'POST',
        body: '{',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
    ).status,
    400
  )
  assert.equal(
    (await f.write('/api/comments', f.input({ content: 'x'.repeat(140000) })))
      .status,
    413
  )
})
test('reply constraints reject cross-page roots and immutable relationships', async t => {
  const f = fixture(t),
    root = await f.create()
  assert.equal(
    (
      await f.write(
        '/api/comments',
        f.input({ path: '/elsewhere', reply_to_id: root.id })
      )
    ).status,
    400
  )
  let parent = root
  for (let i = 0; i < 12; i++)
    parent = await f.create({ reply_to_id: parent.id, content: `reply ${i}` })
  assert.equal(parent.root_id, root.id)
  await assert.rejects(
    () =>
      f.db
        .prepare('UPDATE comments SET root_id=NULL WHERE id=?')
        .bind(parent.id)
        .run(),
    /immutable/
  )
  const list = await f.list()
  assert.equal(list.comments[0].reply_count, 12)
  assert.equal(list.comments[0].replies.length, 3)
  assert.ok(list.comments[0].reply_cursor)
})
test('like and unlike are idempotent by identity, including concurrent requests', async t => {
  const f = fixture(t),
    c = await f.create()
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      f.write(`/api/comments/${c.id}/like`, undefined, 'PUT', other)
    )
  )
  for (const res of results)
    assert.equal(res.status, 200, await res.clone().text())
  let data = await f.list('/article', other)
  assert.equal(data.comments[0].like_count, 1)
  assert.equal(data.comments[0].liked, true)
  await f.write(`/api/comments/${c.id}/like`, undefined, 'PUT', token)
  assert.equal((await f.list()).comments[0].like_count, 2)
  await f.write(`/api/comments/${c.id}/like`, undefined, 'DELETE', other)
  await f.write(`/api/comments/${c.id}/like`, undefined, 'DELETE', other)
  data = await f.list('/article', other)
  assert.equal(data.comments[0].like_count, 1)
  assert.equal(data.comments[0].liked, false)
  assert.equal(
    (await f.write('/api/comments/missing/like', undefined, 'PUT', other))
      .status,
    404
  )
})
test('author deletion erases personal content but preserves other replies and retry tombstone', async t => {
  const f = fixture(t),
    body = f.input({ email: 'private@example.com' }),
    res = await f.write('/api/comments', body),
    root = await res.json()
  const child = await f.create({ reply_to_id: root.id }, other)
  assert.equal(
    (await f.write(`/api/comments/${root.id}`, undefined, 'DELETE', other))
      .status,
    403
  )
  assert.equal(
    (await f.write(`/api/comments/${root.id}`, undefined, 'DELETE')).status,
    200
  )
  assert.equal(
    (await f.write(`/api/comments/${root.id}`, undefined, 'DELETE')).status,
    200
  )
  const data = await f.list()
  assert.equal(data.total, 1)
  assert.equal(data.comments[0].deleted, true)
  assert.equal(data.comments[0].replies[0].id, child.id)
  const row = await f.db
    .prepare('SELECT * FROM comments WHERE id=?')
    .bind(root.id)
    .first()
  assert.equal(row.email, null)
  assert.equal(row.content_md, null)
  const replay = await f.write('/api/comments', body)
  assert.equal(replay.status, 201)
  assert.equal((await replay.json()).deleted, true)
  assert.equal(
    (await f.write(`/api/comments/${root.id}/like`, undefined, 'PUT')).status,
    404
  )
  assert.equal(
    (await f.write('/api/comments', f.input({ reply_to_id: root.id }))).status,
    400
  )
  await f.create({ reply_to_id: child.id })
  assert.equal((await f.list()).total, 2)
})
test('pending private receipt, moderation, hidden threads and counts are consistent', async t => {
  const f = fixture(t, { MODERATION_MODE: 'pre' }),
    c = await f.create()
  assert.equal(c.status, 'pending')
  assert.equal((await f.list()).total, 0)
  const mine = await f.request('/api/me/comments?path=/article', {
    headers: { Authorization: `Bearer ${token}` },
  })
  assert.equal((await mine.json()).comments[0].id, c.id)
  assert.equal((await f.request(`/api/comments/${c.id}/context`)).status, 404)
  assert.equal((await f.moderate(c.id, 'published')).status, 200)
  assert.equal((await f.list()).total, 1)
  const child = await f.create({ reply_to_id: c.id })
  await f.moderate(child.id, 'published')
  const grand = await f.create({ reply_to_id: child.id })
  await f.moderate(grand.id, 'published')
  await f.moderate(child.id, 'hidden')
  let data = await f.list()
  assert.equal(data.total, 2)
  assert.equal(data.comments[0].replies[0].reply_to.available, false)
  await f.moderate(c.id, 'hidden')
  assert.equal((await f.list()).total, 0)
  assert.equal((await f.request(`/api/threads/${c.id}/replies`)).status, 404)
  await f.moderate(c.id, 'published')
  assert.equal((await f.list()).total, 2)
  const counts = await f.request(
    '/api/comments/count?paths[]=/article&paths[]=/empty'
  )
  assert.deepEqual(await counts.json(), { '/article': 2, '/empty': 0 })
})
test('root cursors freeze creation order across new posts and pin changes', async t => {
  const f = fixture(t)
  const roots = []
  for (let i = 0; i < 5; i++)
    roots.push(await f.create({ content: `root ${i}` }))
  let response = await f.request('/api/comments?path=/article&limit=2')
  let page = await response.json()
  assert.deepEqual(
    page.comments.map(c => c.id),
    [roots[4].id, roots[3].id]
  )
  await f.create()
  await f.write(
    `/api/admin/comments/${roots[0].id}`,
    { is_pinned: true },
    'PATCH',
    'test-admin'
  )
  response = await f.request(
    `/api/comments?path=/article&limit=2&cursor=${encodeURIComponent(page.next_cursor)}`
  )
  page = await response.json()
  assert.deepEqual(
    page.comments.map(c => c.id),
    [roots[2].id, roots[1].id]
  )
  assert.equal(
    (
      await f.request(
        `/api/comments?path=/wrong&cursor=${encodeURIComponent(page.next_cursor)}`
      )
    ).status,
    400
  )
  assert.equal(
    (await f.request('/api/comments?path=/article&cursor=bad')).status,
    400
  )
})
test('reply pages and context are bounded and locate unloaded parents', async t => {
  const f = fixture(t),
    root = await f.create()
  const replies = []
  for (let i = 0; i < 9; i++)
    replies.push(
      await f.create({ reply_to_id: i ? replies[i - 1].id : root.id })
    )
  const preview = (await f.list()).comments[0]
  const response = await f.request(
    `/api/threads/${root.id}/replies?limit=2&cursor=${encodeURIComponent(preview.reply_cursor)}`
  )
  const page = await response.json()
  assert.deepEqual(
    page.comments.map(c => c.id),
    [replies[3].id, replies[4].id]
  )
  assert.ok(page.next_cursor)
  const context = await (
    await f.request(`/api/comments/${replies[7].id}/context`)
  ).json()
  assert.ok(context.root.replies.some(c => c.id === replies[7].id))
  assert.equal(
    context.root.replies.find(c => c.id === replies[7].id).reply_to.id,
    replies[6].id
  )
  const otherRoot = await f.create()
  assert.equal(
    (
      await f.request(
        `/api/threads/${otherRoot.id}/replies?cursor=${encodeURIComponent(page.next_cursor)}`
      )
    ).status,
    400
  )
})
test('admin is independent of visitor credentials and fails closed', async t => {
  const f = fixture(t),
    c = await f.create()
  for (const path of ['/api/admin/comments', '/api/admin/notifications']) {
    assert.equal((await f.request(path)).status, 401)
    assert.equal(
      (await f.request(path, { headers: { Authorization: `Bearer ${token}` } }))
        .status,
      401
    )
    assert.equal((await f.request(path + '?token=test-admin')).status, 401)
  }
  assert.equal(
    (await f.request('/api/admin/comments', { headers: admin })).status,
    200
  )
  const otherEnv = fixture(t, { ADMIN_TOKEN: undefined })
  assert.equal(
    (await otherEnv.request('/api/admin/comments', { headers: admin })).status,
    401
  )
  const own = await f.write(
    '/api/admin/comments',
    f.input(),
    'POST',
    'test-admin'
  )
  assert.equal((await own.json()).is_admin, true)
  assert.equal(
    (
      await f.write(
        `/api/admin/comments/${c.id}`,
        undefined,
        'DELETE',
        'test-admin'
      )
    ).status,
    200
  )
})
test('blocking an identity rejects replay, likes and new registration of the same token', async t => {
  const f = fixture(t),
    c = await f.create()
  const actor = await f.db
    .prepare('SELECT id FROM identities WHERE token_hash=?')
    .bind(await digest(token))
    .first()
  assert.equal(
    (
      await f.write(
        `/api/admin/identities/${actor.id}`,
        { status: 'blocked' },
        'PATCH',
        'test-admin'
      )
    ).status,
    200
  )
  assert.equal((await f.write('/api/comments', f.input())).status, 403)
  assert.equal(
    (await f.write(`/api/comments/${c.id}/like`, undefined, 'PUT')).status,
    403
  )
  assert.equal(
    (await f.write(`/api/comments/${c.id}`, undefined, 'DELETE')).status,
    403
  )
})
test('per-page and global close switches preserve reads', async t => {
  const f = fixture(t)
  await f.create()
  assert.equal(
    (
      await f.write(
        '/api/admin/pages',
        { path: '/article', comments_enabled: false },
        'PATCH',
        'test-admin'
      )
    ).status,
    200
  )
  assert.equal((await f.write('/api/comments', f.input())).status, 403)
  assert.equal((await f.list()).comments_enabled, false)
  const closed = fixture(t, { COMMENTS_ENABLED: 'false' })
  assert.equal(
    (await closed.write('/api/comments', closed.input({ path: '/other' })))
      .status,
    403
  )
})
test('rate limits fail closed, expose retry headers and do not write identities', async t => {
  const f = fixture(t, {
    RATE_LIMIT_ENABLED: 'true',
    WRITE_LIMITER: { limit: async () => ({ success: false }) },
  })
  const res = await f.write('/api/comments', f.input())
  assert.equal(res.status, 429)
  assert.equal(res.headers.get('Retry-After'), '60')
  assert.equal(
    (
      await f.db
        .prepare("SELECT COUNT(*) n FROM identities WHERE kind='visitor'")
        .first()
    ).n,
    0
  )
  const missing = fixture(t, {
    RATE_LIMIT_ENABLED: 'true',
    WRITE_LIMITER: undefined,
  })
  assert.equal(
    (await missing.write('/api/comments', missing.input())).status,
    503
  )
  const allowed = fixture(t, {
    RATE_LIMIT_ENABLED: 'true',
    WRITE_LIMITER: { limit: async () => ({ success: true }) },
  })
  await allowed.create()
})
test('Markdown, avatar and UA remain safe public display values', async t => {
  const f = fixture(t),
    res = await f.write(
      '/api/comments',
      f.input({
        nick: '<img onerror=alert(1)>',
        email: ' A@example.com ',
        content:
          '<script>alert(1)</script>\n[link](https://example.com)\n\n|a|b|\n|-|-|\n|1|2|',
      })
    )
  assert.equal(res.status, 201)
  const c = await res.json()
  assert.ok(!c.content_html.includes('<script>'))
  assert.match(c.content_html, /nofollow/)
  assert.match(c.content_html, /<table>/)
  assert.equal(clientInfo(null), undefined)
  assert.ok(
    renderMarkdown('![bad](javascript:alert(1))').indexOf('src="javascript:') <
      0
  )
})
test('notifications are committed once, leased and retried without leaking payload', async t => {
  const config = {
    EMAIL_ENABLED: 'true',
    RESEND_API_KEY: 'fake',
    EMAIL_FROM: 'Hitalk <noreply@example.com>',
    ADMIN_EMAIL: 'owner@example.com',
    SITE_URL: 'https://example.com',
    NOTIFICATION_API_URL: 'https://api.example.com',
  }
  // Do not enable mail in request context; enqueue in a controlled create call below.
  const f = fixture(t)
  const { createComment } =
    await import('../apps/server/src/services/comments.ts')
  const env = { ...f.env, ...config }
  const body = f.input()
  await createComment(env, await digest(token), body, 'test')
  await createComment(env, await digest(token), body, 'test')
  assert.equal(
    (await f.db.prepare('SELECT COUNT(*) n FROM notification_jobs').first()).n,
    1
  )
  const send = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{}', { status: 503 }))
  await processNotifications(env)
  let job = await f.db.prepare('SELECT * FROM notification_jobs').first()
  assert.equal(job.status, 'pending')
  assert.equal(job.attempts, 1)
  send.mockResolvedValue(new Response('{}', { status: 200 }))
  await Promise.all([
    processNotifications(env, job.next_attempt_at + 1),
    processNotifications(env, job.next_attempt_at + 1),
  ])
  job = await f.db.prepare('SELECT * FROM notification_jobs').first()
  assert.equal(job.status, 'sent')
  assert.equal(send.mock.calls.length, 2)
  assert.ok(send.mock.calls[0][1].headers['Idempotency-Key'])
})
test('notification deliveries preserve original owner/reply copy, inline styles and quoted context', async t => {
  const f = fixture(t)
  const { createComment } =
    await import('../apps/server/src/services/comments.ts')
  const env = {
    ...f.env,
    EMAIL_ENABLED: 'true',
    RESEND_API_KEY: 'fake',
    EMAIL_FROM: 'Blog <comments@example.com>',
    EMAIL_NAME: '我的博客',
    ADMIN_EMAIL: 'owner@example.com',
    SITE_URL: 'https://example.com',
    NOTIFICATION_API_URL: 'https://api.example.com',
  }
  const title = '文章 <img src=x onerror=alert(1)>'
  const root = await f.create({
    title,
    nick: '小明 & 读者',
    content: '**原评论**\n\n@(哈哈)',
    email: 'reader@example.com',
    notify: true,
  })
  const reply = await createComment(
    env,
    await digest(other),
    f.input({
      reply_to_id: root.id,
      nick: '<script>昵称</script>',
      content:
        '**新回复**\n\n<script>alert(1)</script>\n\n```js\nconst answer = 42\n```',
    }),
    undefined
  )
  const send = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{}', { status: 200 }))
  await processNotifications(env)
  const messages = send.mock.calls.map(([url, init]) => {
    assert.equal(url, 'https://api.resend.com/emails')
    assert.equal(init.headers.Authorization, 'Bearer fake')
    return JSON.parse(init.body)
  })
  assert.equal(messages.length, 2)
  const owner = messages.find(message => message.to === env.ADMIN_EMAIL)
  const reader = messages.find(message => message.to === 'reader@example.com')
  assert.equal(owner.subject, `[我的博客] 👉 咚！「${title}」有新评论了`)
  assert.equal(
    reader.subject,
    `[我的博客] 👉 叮咚！「${title}」上评论有了新回复`
  )
  assert.ok(owner.html.includes('上有一条新评论，内容如下：'))
  assert.ok(owner.html.includes('点击前往查看'))
  assert.ok(!owner.html.includes('你的评论：'))
  assert.ok(reader.html.includes('您(小明 &amp; 读者)'))
  assert.ok(reader.html.includes('你的评论：'))
  assert.ok(reader.html.includes('<strong>原评论</strong>'))
  assert.ok(reader.html.includes('查看回复的完整內容'))
  assert.ok(reader.html.includes('newpaopao/哈哈@2x.png'))
  for (const message of messages) {
    assert.equal(message.from, env.EMAIL_FROM)
    assert.ok(message.html.includes('border-top:2px solid #12ADDB'))
    assert.ok(message.html.includes('max-width:500px'))
    assert.ok(message.html.includes('background-color:#f5f5f5'))
    assert.ok(message.html.includes('<strong>新回复</strong>'))
    assert.ok(message.html.includes('<pre style="white-space:pre-wrap;'))
    assert.ok(message.html.includes('&lt;script&gt;昵称&lt;/script&gt;'))
    assert.ok(!message.html.includes('<script>'))
    assert.ok(!message.html.includes('<img src=x'))
    assert.ok(
      message.html.includes(`href="https://example.com/article#${reply.id}"`)
    )
    assert.ok(message.html.includes('本邮件为系统自动发送，请勿直接回复。'))
    assert.match(
      message.html,
      /href="https:\/\/api\.example\.com\/api\/notifications\/unsubscribe\/[0-9a-f-]+"/
    )
    assert.ok(message.text.includes(`https://example.com/article#${reply.id}`))
    assert.ok(message.text.includes('停止邮件通知：'))
  }
  assert.ok(reader.text.includes('**原评论**'))
})

test('hidden reply context cancels notification rather than quoting moderated content', async t => {
  const f = fixture(t)
  const { createComment } =
    await import('../apps/server/src/services/comments.ts')
  const root = await f.create()
  const parent = await f.create({
    reply_to_id: root.id,
    email: 'reader@example.com',
    notify: true,
  })
  const env = {
    ...f.env,
    EMAIL_ENABLED: 'true',
    RESEND_API_KEY: 'fake',
    EMAIL_FROM: 'comments@example.com',
    SITE_URL: 'https://example.com',
    NOTIFICATION_API_URL: 'https://api.example.com',
  }
  await createComment(
    env,
    await digest(other),
    f.input({ reply_to_id: parent.id }),
    undefined
  )
  await f.moderate(parent.id, 'hidden')
  const send = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{}'))
  await processNotifications(env)
  assert.equal(send.mock.calls.length, 0)
  assert.equal(
    (await f.db.prepare('SELECT status FROM notification_jobs').first()).status,
    'cancelled'
  )
})

test('hidden/deleted notifications cancel, subscriptions can opt out', async t => {
  const f = fixture(t)
  const { createComment } =
    await import('../apps/server/src/services/comments.ts')
  const env = {
    ...f.env,
    EMAIL_ENABLED: 'true',
    RESEND_API_KEY: 'fake',
    EMAIL_FROM: 'x@example.com',
    ADMIN_EMAIL: 'owner@example.com',
    SITE_URL: 'https://example.com',
    NOTIFICATION_API_URL: 'https://api.example.com',
  }
  const c = await createComment(env, await digest(token), f.input(), 'test')
  const job = await f.db.prepare('SELECT * FROM notification_jobs').first()
  assert.equal(
    (
      await f.request(`/api/notifications/unsubscribe/${job.id}`, {
        method: 'POST',
      })
    ).status,
    200
  )
  const send = vi.spyOn(globalThis, 'fetch')
  await processNotifications(env)
  assert.equal(send.mock.calls.length, 0)
  await f.moderate(c.id, 'hidden')
  assert.equal(
    (await f.db.prepare('SELECT status FROM notification_jobs').first()).status,
    'cancelled'
  )
})

test('large threads return bounded previews and preserve a complete cursor traversal', async t => {
  const f = fixture(t),
    root = await f.create()
  const row = await f.db
    .prepare('SELECT * FROM comments WHERE id=?')
    .bind(root.id)
    .first()
  for (let batch = 0; batch < 10; batch++)
    await f.db.batch(
      Array.from({ length: 100 }, (_, i) => {
        const n = batch * 100 + i
        return f.db
          .prepare(
            'INSERT INTO comments(id,page_id,author_id,root_id,reply_to_id,client_request_id,request_hash,nick,content_md) VALUES(?,?,?,?,?,?,?,?,?)'
          )
          .bind(
            `bulk-${n}`,
            row.page_id,
            row.author_id,
            root.id,
            root.id,
            `bulk-${n}`,
            'fixture',
            'Reader',
            'reply'
          )
      })
    )
  const data = await f.list()
  assert.equal(data.total, 1001)
  assert.equal(data.comments[0].replies.length, 3)
  assert.equal(data.comments[0].reply_count, 1000)
  const first = await (
    await f.request(`/api/threads/${root.id}/replies?limit=50`)
  ).json()
  assert.equal(first.comments.length, 50)
  assert.ok(first.next_cursor)
  const next = await (
    await f.request(
      `/api/threads/${root.id}/replies?limit=50&cursor=${encodeURIComponent(first.next_cursor)}`
    )
  ).json()
  assert.equal(next.comments.length, 50)
  assert.equal(
    new Set([...first.comments, ...next.comments].map(c => c.id)).size,
    100
  )
})

test('notification payload is stable across configuration changes; all recipient data erases on author delete', async t => {
  const f = fixture(t)
  const { createComment } =
    await import('../apps/server/src/services/comments.ts')
  const env = {
    ...f.env,
    EMAIL_ENABLED: 'true',
    RESEND_API_KEY: 'fake',
    EMAIL_FROM: 'a@example.com',
    ADMIN_EMAIL: 'owner@example.com',
    SITE_URL: 'https://example.com',
    NOTIFICATION_API_URL: 'https://api.example.com',
  }
  const root = await f.create({ email: 'reader@example.com', notify: true })
  const reply = await createComment(
    env,
    await digest(other),
    f.input({ reply_to_id: root.id }),
    undefined
  )
  assert.equal(
    (await f.db.prepare('SELECT COUNT(*) n FROM notification_jobs').first()).n,
    2
  )
  const send = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{}', { status: 503 }))
  await processNotifications(env)
  const originals = new Map(
    send.mock.calls.map(([, init]) => [
      init.headers['Idempotency-Key'],
      init.body,
    ])
  )
  send.mockClear()
  // Retries must reuse the original quote as well as the original sender.
  await f.db
    .prepare('UPDATE comments SET content_md=? WHERE id=?')
    .bind('changed after first attempt', root.id)
    .run()
  const jobs = await f.db.prepare('SELECT * FROM notification_jobs').all()
  await processNotifications(
    { ...env, EMAIL_FROM: 'changed@example.com' },
    Math.max(...jobs.results.map(j => j.next_attempt_at)) + 1
  )
  for (const [, init] of send.mock.calls)
    assert.equal(init.body, originals.get(init.headers['Idempotency-Key']))
  assert.equal(
    (await f.write(`/api/comments/${reply.id}`, undefined, 'DELETE', other))
      .status,
    200
  )
  const removed = await f.db
    .prepare('SELECT recipient,payload_json,status FROM notification_jobs')
    .all()
  for (const job of removed.results) {
    assert.equal(job.recipient, null)
    assert.equal(job.payload_json, null)
    assert.equal(job.status, 'cancelled')
  }
})

test('reply recipient deletion cancels queued child notifications without deleting child', async t => {
  const f = fixture(t)
  const { createComment } =
    await import('../apps/server/src/services/comments.ts')
  const env = {
    ...f.env,
    EMAIL_ENABLED: 'true',
    RESEND_API_KEY: 'fake',
    EMAIL_FROM: 'a@example.com',
    SITE_URL: 'https://example.com',
    NOTIFICATION_API_URL: 'https://api.example.com',
  }
  const root = await f.create({ email: 'reader@example.com', notify: true })
  await createComment(
    env,
    await digest(other),
    f.input({ reply_to_id: root.id }),
    undefined
  )
  await f.write(`/api/comments/${root.id}`, undefined, 'DELETE')
  const job = await f.db.prepare('SELECT * FROM notification_jobs').first()
  assert.equal(job.recipient, null)
  assert.equal(job.status, 'cancelled')
  assert.equal((await f.list()).total, 1)
})

test('notification leases recover and terminal failures respect the provider idempotency window', async t => {
  const f = fixture(t)
  const { createComment } =
    await import('../apps/server/src/services/comments.ts')
  const env = {
    ...f.env,
    EMAIL_ENABLED: 'true',
    RESEND_API_KEY: 'fake',
    EMAIL_FROM: 'a@example.com',
    ADMIN_EMAIL: 'owner@example.com',
    SITE_URL: 'https://example.com',
    NOTIFICATION_API_URL: 'https://api.example.com',
  }
  await createComment(env, await digest(token), f.input(), undefined)
  const send = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('network'))
  await processNotifications(env)
  let job = await f.db.prepare('SELECT * FROM notification_jobs').first()
  assert.equal(job.last_error, 'delivery_unconfirmed')
  send.mockResolvedValue(new Response('{}', { status: 400 }))
  await processNotifications(env, job.next_attempt_at + 1)
  job = await f.db.prepare('SELECT * FROM notification_jobs').first()
  assert.equal(job.status, 'failed')
  await f.db
    .prepare("UPDATE notification_jobs SET status='sending',lease_until=0")
    .run()
  await processNotifications(env, job.first_attempt_at + 24 * 3600000)
  job = await f.db.prepare('SELECT * FROM notification_jobs').first()
  assert.equal(job.last_error, 'retry_window_exceeded')
  assert.equal(send.mock.calls.length, 2)
})

test('one thousand replies stay bounded, and locating a late reply keeps earlier pagination available', async t => {
  const f = fixture(t),
    root = await f.create()
  const original = await f.db
    .prepare('SELECT page_id,author_id FROM comments WHERE id=?')
    .bind(root.id)
    .first()
  for (let batch = 0; batch < 10; batch++)
    await f.db.batch(
      Array.from({ length: 100 }, (_, offset) => {
        const i = batch * 100 + offset
        return f.db
          .prepare(
            'INSERT INTO comments(id,page_id,author_id,root_id,reply_to_id,client_request_id,request_hash,nick,content_md) VALUES(?,?,?,?,?,?,?,?,?)'
          )
          .bind(
            `bulk-${i}`,
            original.page_id,
            original.author_id,
            root.id,
            root.id,
            `bulk-${i}`,
            'bulk',
            'Reader',
            'reply'
          )
      })
    )
  const page = await f.list()
  assert.equal(page.total, 1001)
  assert.equal(page.comments[0].replies.length, 3)
  const context = await (
    await f.request('/api/comments/bulk-999/context')
  ).json()
  assert.equal(context.root.replies.length, 4)
  assert.ok(context.root.reply_cursor)
  assert.ok(context.root.replies.some(c => c.id === 'bulk-999'))
  const replies = await (
    await f.request(`/api/threads/${root.id}/replies?limit=50`)
  ).json()
  assert.equal(replies.comments.length, 50)
  assert.ok(replies.next_cursor)
})
