import { test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import app from '../apps/server/src/index.ts'
import { renderMarkdown } from '../apps/server/src/lib/markdown.ts'
import { clientInfo } from '../apps/server/src/lib/user-agent.ts'
import { buildCommentTree, hashIP } from '../apps/server/src/lib/db.ts'
import { mailPlugin } from '../apps/server/src/plugins/mail.ts'
import { PluginManager } from '../apps/server/src/lib/plugin-manager.ts'
import { env as bindings } from 'cloudflare:workers'
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'

function fixture(t, overrides = {}) {
  const db = bindings.DB
  const env = { ...bindings, ...overrides }
  const context = createExecutionContext()
  t.onTestFinished(() => waitOnExecutionContext(context))
  const request = (path, init = {}) =>
    app.request(`http://localhost${path}`, init, env, context)
  const post = (body, headers = {}) =>
    request('/comments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': '192.0.2.1',
        ...headers,
      },
      body: JSON.stringify(body),
    })
  const create = async (extra = {}) => {
    const response = await post({
      path: '/article',
      nick: 'Reader',
      content: 'hello',
      ...extra,
    })
    assert.equal(response.status, 201, await response.clone().text())
    return response.json()
  }
  return { db, env, request, post, create }
}

const authorization = { Authorization: 'Bearer test-admin' }

test('admin fails closed and rejects URL credentials across read and mutation routes', async t => {
  for (const token of [undefined, '', 'test-admin']) {
    const f = fixture(t, { ADMIN_TOKEN: token })
    assert.equal((await f.request('/admin/api/comments')).status, 401)
    assert.equal(
      (await f.request('/admin/api/comments?token=test-admin')).status,
      401
    )
    assert.equal(
      (await f.request('/comments/nope', { method: 'DELETE' })).status,
      401
    )
    assert.equal(
      (await f.request('/comments/nope/pin', { method: 'PUT' })).status,
      401
    )
  }
  const f = fixture(t)
  assert.equal(
    (await f.request('/admin/api/comments', { headers: authorization })).status,
    200
  )
  assert.equal(
    (
      await f.request('/admin/api/comments', {
        headers: { Authorization: 'test-admin' },
      })
    ).status,
    401
  )
  const page = await f.request('/admin?token=DO_NOT_REFLECT')
  assert.equal(page.headers.get('cache-control'), 'no-store')
  assert.ok(!(await page.text()).includes('DO_NOT_REFLECT'))
})

test('public responses use an allowlist, including replies and newly created comments', async t => {
  const f = fixture(t)
  const root = await f.create({
    email: 'person@example.invalid',
    website: 'https://example.com',
    nick: '测试',
  })
  await f.create({ parent_id: root.id, email: 'reply@example.invalid' })
  const list = await (await f.request('/comments?path=/article')).json()
  for (const comment of [
    root,
    list.comments[0],
    list.comments[0].children[0],
  ]) {
    for (const field of ['email', 'ua', 'ip_hash', 'content_md', 'page_id'])
      assert.ok(!(field in comment), field)
    assert.equal(typeof comment.is_admin, 'boolean')
    assert.equal(typeof comment.is_pinned, 'boolean')
  }
  assert.equal(
    root.avatar_hash,
    createHash('md5').update('person@example.invalid').digest('hex')
  )
  const unicode = await f.create({ nick: '中文昵称' })
  assert.equal(
    unicode.avatar_hash,
    createHash('md5').update('中文昵称').digest('hex')
  )
  const admin = await (
    await f.request('/admin/api/comments', { headers: authorization })
  ).json()
  assert.ok(
    admin.comments.some(comment => comment.email === 'person@example.invalid')
  )
})

test('invalid inputs return 400, oversized bodies 413, without writing pages', async t => {
  const f = fixture(t)
  const base = { path: '/article', nick: 'Reader', content: 'hello' }
  for (const input of [
    null,
    [],
    1,
    { ...base, nick: {} },
    { ...base, content: ' ' },
    { ...base, content: 'a'.repeat(20001) },
    { ...base, nick: 'a'.repeat(81) },
    { ...base, email: 'invalid' },
    { ...base, website: 'javascript:alert(1)' },
    { ...base, website: 'https://user:password@example.com' },
    { ...base, path: '//other.example' },
    { ...base, path: '/post?token=x' },
    { ...base, parent_id: 123 },
  ]) {
    assert.equal(
      (await f.post(input)).status,
      400,
      JSON.stringify(input).slice(0, 150)
    )
  }
  assert.equal(
    (await f.request('/comments', { method: 'POST', body: '{' })).status,
    400
  )
  assert.equal(
    (await f.post({ ...base, content: 'x'.repeat(140000) })).status,
    413
  )
  assert.equal(
    (await f.db.prepare('SELECT COUNT(*) AS total FROM pages').first()).total,
    0
  )
})

test('GET is read-only, pagination parameters and batch size are bounded', async t => {
  const f = fixture(t)
  const response = await f.request('/comments?path=/new')
  assert.equal(response.status, 200)
  assert.equal(
    (await f.db.prepare('SELECT COUNT(*) AS total FROM pages').first()).total,
    0
  )
  for (const query of ['pageSize=0', 'pageSize=51', 'page=-1', 'page=1.5'])
    assert.equal((await f.request(`/comments?path=/new&${query}`)).status, 400)
  assert.equal(
    (
      await f.request(
        '/comments/count?' + Array(51).fill('paths[]=/new').join('&')
      )
    ).status,
    400
  )
})

test('cross-page and missing parents are rejected by routes and database constraints', async t => {
  const f = fixture(t)
  const root = await f.create()
  assert.equal(
    (
      await f.post({
        path: '/other',
        nick: 'Other',
        content: 'reply',
        parent_id: root.id,
      })
    ).status,
    400
  )
  assert.equal(
    (
      await f.post({
        path: '/article',
        nick: 'Other',
        content: 'reply',
        parent_id: 'missing',
      })
    ).status,
    400
  )
  await f.db.prepare("INSERT INTO pages(path) VALUES('/other')").run()
  await assert.rejects(
    () =>
      f.db
        .prepare(
          `INSERT INTO comments(id,page_id,parent_id,nick,content_md) VALUES('cross',2,?,'x','x')`
        )
        .bind(root.id)
        .run(),
    /invalid_parent/
  )
  await assert.rejects(
    () =>
      f.db
        .prepare('UPDATE comments SET parent_id = id WHERE id = ?')
        .bind(root.id)
        .run(),
    /immutable/
  )
})

test('cascade deletion keeps all counters and likes consistent', async t => {
  const f = fixture(t)
  const root = await f.create()
  const child = await f.create({ parent_id: root.id })
  await f.create({ parent_id: child.id })
  const kept = await f.create()
  await f.request(`/comments/${child.id}/like`, { method: 'POST' })
  assert.equal(
    (await f.db.prepare('SELECT comment_count FROM pages').first())
      .comment_count,
    4
  )
  assert.equal(
    (
      await f.request(`/comments/${root.id}`, {
        method: 'DELETE',
        headers: authorization,
      })
    ).status,
    200
  )
  assert.equal(
    (await f.db.prepare('SELECT comment_count FROM pages').first())
      .comment_count,
    1
  )
  assert.deepEqual(
    (await f.db.prepare('SELECT id FROM comments').all()).results.map(
      row => row.id
    ),
    [kept.id]
  )
  assert.equal(
    (await f.db.prepare('SELECT COUNT(*) AS total FROM comment_likes').first())
      .total,
    0
  )
  assert.equal(
    (
      await f.request(`/comments/${root.id}`, {
        method: 'DELETE',
        headers: authorization,
      })
    ).status,
    404
  )
})

test('concurrent page creation and repeated likes do not duplicate counters', async t => {
  const f = fixture(t)
  const roots = await Promise.all(Array.from({ length: 8 }, () => f.create()))
  assert.equal(
    (await f.db.prepare('SELECT COUNT(*) AS total FROM pages').first()).total,
    1
  )
  assert.equal(
    (await f.db.prepare('SELECT comment_count FROM pages').first())
      .comment_count,
    8
  )
  const results = await Promise.all(
    Array.from({ length: 8 }, async () =>
      (
        await f.request(`/comments/${roots[0].id}/like`, {
          method: 'POST',
          headers: { 'cf-connecting-ip': '192.0.2.2' },
        })
      ).json()
    )
  )
  assert.equal(results.filter(result => result.success).length, 1)
  assert.ok(results.every(result => result.like_count === 1))
  assert.equal(
    (await f.request('/comments/missing/like', { method: 'POST' })).status,
    404
  )
  assert.equal(
    (
      await f.request('/comments/missing/pin', {
        method: 'PUT',
        headers: authorization,
        body: JSON.stringify({ is_pinned: true }),
      })
    ).status,
    404
  )
  assert.equal(
    (
      await f.request(`/comments/${roots[0].id}/pin`, {
        method: 'PUT',
        headers: authorization,
        body: JSON.stringify({ is_pinned: 'false' }),
      })
    ).status,
    400
  )
})

test('counter and insert roll back together on database failure', async t => {
  const f = fixture(t)
  await f.create()
  await f.db
    .prepare(
      "CREATE TRIGGER forced_failure BEFORE UPDATE OF comment_count ON pages BEGIN SELECT RAISE(ABORT, 'forced'); END"
    )
    .run()
  await assert.rejects(
    () =>
      f.db
        .prepare(
          "INSERT INTO comments(id,page_id,nick,content_md) VALUES('fail',1,'x','x')"
        )
        .run(),
    /forced/
  )
  assert.equal(
    (await f.db.prepare('SELECT COUNT(*) AS total FROM comments').first())
      .total,
    1
  )
  assert.equal(
    (await f.db.prepare('SELECT comment_count FROM pages').first())
      .comment_count,
    1
  )
})

test('root pagination includes nested replies and preserves pinned ordering', async t => {
  const f = fixture(t)
  const roots = await Promise.all([f.create(), f.create(), f.create()])
  const child = await f.create({ parent_id: roots[0].id })
  await f.create({ parent_id: child.id })
  await f.request(`/comments/${roots[0].id}/pin`, {
    method: 'PUT',
    headers: authorization,
    body: JSON.stringify({ is_pinned: true }),
  })
  const first = await (
    await f.request('/comments?path=/article&pageSize=1')
  ).json()
  assert.equal(first.comments[0].id, roots[0].id)
  assert.equal(first.comments[0].children.length, 2)
  assert.equal(first.total, 5)
  assert.equal(first.pagination.has_more, true)
  const ids = []
  for (let page = 1; page <= 3; page++) {
    const result = await (
      await f.request(`/comments?path=/article&pageSize=1&page=${page}`)
    ).json()
    ids.push(result.comments[0].id)
    assert.equal(result.pagination.has_more, page < 3)
  }
  assert.equal(new Set(ids).size, 3)
})

test('Markdown strips active HTML, preserves formatting and emoji', () => {
  const html = renderMarkdown(
    '<script>alert(1)</script>\n\n![x](javascript:alert(1))\n\n**safe** @(呵呵)'
  )
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('src="javascript:'))
  assert.ok(html.includes('<strong>safe</strong>'))
  assert.ok(html.includes('class="biaoqing newpaopao"'))
})

test('Markdown preserves tables, alignment, rules and ordered-list start without allowing arbitrary HTML', () => {
  const html = renderMarkdown(
    '| Left | Right |\n| :--- | ---: |\n| **one** | two |\n\n---\n\n3. third\n4. fourth\n\n<table onclick="alert(1)"><tr><td>raw</td></tr></table>'
  )
  assert.match(html, /<table>/)
  assert.match(html, /<th align="left">Left<\/th>/)
  assert.match(html, /<td align="right">two<\/td>/)
  assert.match(html, /<strong>one<\/strong>/)
  assert.match(html, /<hr\s*\/?>/)
  assert.match(html, /<ol start="3">/)
  assert.ok(!html.includes('<table onclick'))
  assert.ok(!html.includes('style='))
})

test('Markdown web links open safely in another tab while comment anchors remain local', () => {
  const html = renderMarkdown(
    '[external](https://example.com) [relative](/post/) [cdn](//example.com) [parent](#parent) [email](mailto:reader@example.com)'
  )
  for (const href of ['https://example.com', '/post/', '//example.com'])
    assert.ok(
      html.includes(
        `href="${href}" target="_blank" rel="nofollow noopener noreferrer"`
      )
    )
  assert.ok(html.includes('<a href="#parent">parent</a>'))
  assert.ok(html.includes('<a href="mailto:reader@example.com">email</a>'))
})

test('path aliases share the same page, reply ownership and canonical counter keys', async t => {
  const f = fixture(t)
  const root = await f.create({ path: '/posts/index.html' })
  await f.create({ path: '/posts/index.htm', parent_id: root.id })
  for (const path of ['/posts/', '/posts/index.html', '/posts/index.htm']) {
    const response = await f.request(
      `/comments?path=${encodeURIComponent(path)}`
    )
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.page_info.path, '/posts/')
    assert.equal(body.total, 2)
    assert.equal(body.comments[0].children[0].parent_id, root.id)
  }
  const counts = await (
    await f.request(
      '/comments/count?paths[]=/posts/index.html&paths[]=/posts/&paths[]=/posts/index.htm&paths[]=/missing/index.html'
    )
  ).json()
  assert.deepEqual(counts, { '/posts/': 2, '/missing/': 0 })
  assert.equal(
    (await f.db.prepare('SELECT COUNT(*) AS total FROM pages').first()).total,
    1
  )
  for (const path of ['/posts/?draft=1', '/posts/#more']) {
    assert.equal(
      (await f.request(`/comments?path=${encodeURIComponent(path)}`)).status,
      400
    )
    assert.equal(
      (await f.request(`/comments/count?paths[]=${encodeURIComponent(path)}`))
        .status,
      400
    )
    assert.equal(
      (await f.post({ path, nick: 'Reader', content: 'hello' })).status,
      400
    )
  }
})

test('IP identifiers are keyed and stable; different installations cannot correlate them', async () => {
  assert.equal(
    await hashIP('192.0.2.1', 'salt-a'),
    await hashIP('192.0.2.1', 'salt-a')
  )
  assert.notEqual(
    await hashIP('192.0.2.1', 'salt-a'),
    await hashIP('192.0.2.1', 'salt-b')
  )
})

test('tree builder terminates safely on malformed cycles', () => {
  const tree = buildCommentTree([
    { id: 'a', parent_id: 'b' },
    { id: 'b', parent_id: 'a' },
  ])
  assert.equal(tree.length, 2)
})

test('mail escapes metadata and plugin failures do not stop other plugins', async t => {
  const sent = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    sent.push(JSON.parse(init.body))
    return new Response('{}')
  })
  const f = fixture(t)
  const root = await f.create({
    nick: '<img src=x onerror=alert(1)>',
    title: '<b>title</b>',
  })
  const row = await f.db
    .prepare('SELECT * FROM comments WHERE id=?')
    .bind(root.id)
    .first()
  const page = await f.db.prepare('SELECT * FROM pages').first()
  await mailPlugin.onCommentCreated(
    {
      env: {
        RESEND_API_KEY: 'test',
        ADMIN_EMAIL: 'owner@example.invalid',
        EMAIL_FROM: 'Blog <mail@example.invalid>',
        SITE_URL: 'https://example.com',
      },
    },
    row,
    page
  )
  assert.equal(sent.length, 1)
  assert.ok(sent[0].html.includes('&lt;img'))
  assert.ok(!sent[0].html.includes('<b>title</b>'))
  const plugins = new PluginManager()
  const calls = []
  plugins.register({
    name: 'fail',
    onCommentCreated() {
      throw new Error('expected test failure')
    },
  })
  plugins.register({
    name: 'ok',
    onCommentCreated() {
      calls.push('ok')
    },
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await plugins.commentCreated({}, row, page)
  assert.deepEqual(calls, ['ok'])
})

test('database limits reply depth and stores only necessary comment data', async t => {
  const f = fixture(t)
  await f.db.prepare("INSERT INTO pages(path) VALUES('/deep')").run()
  for (let depth = 0; depth < 8; depth++) {
    await f.db
      .prepare(
        'INSERT INTO comments(id,page_id,parent_id,nick,content_md) VALUES(?,1,?,?,?)'
      )
      .bind(
        `depth-${depth}`,
        depth === 0 ? null : `depth-${depth - 1}`,
        'Reader',
        'hello'
      )
      .run()
  }
  await assert.rejects(
    () =>
      f.db
        .prepare(
          "INSERT INTO comments(id,page_id,parent_id,nick,content_md) VALUES('too-deep',1,'depth-7','Reader','hello')"
        )
        .run(),
    /reply_depth_exceeded/
  )
  await f.db
    .prepare(
      "INSERT INTO comment_likes(comment_id,ip_hash) VALUES('depth-7','test')"
    )
    .run()
  const columns = (
    await f.db.prepare('PRAGMA table_info(comments)').all()
  ).results.map(row => row.name)
  assert.ok(columns.includes('ua'))
  for (const removed of ['content_html', 'ip_hash'])
    assert.ok(!columns.includes(removed))
  const rejected = await f.post({
    path: '/deep',
    nick: 'Reader',
    content: 'too deep',
    parent_id: 'depth-7',
  })
  assert.equal(rejected.status, 400)
  await f.db.prepare("DELETE FROM comments WHERE id='depth-0'").run()
  assert.equal(
    (await f.db.prepare('SELECT comment_count FROM pages').first())
      .comment_count,
    0
  )
})

test('deleting a page at the maximum reply depth also removes its likes', async t => {
  const f = fixture(t)
  let parent
  for (let depth = 0; depth < 8; depth++)
    parent = await f.create({ parent_id: parent?.id })
  await f.request(`/comments/${parent.id}/like`, { method: 'POST' })
  await f.db.prepare('DELETE FROM pages').run()
  assert.equal(
    (await f.db.prepare('SELECT COUNT(*) AS count FROM comments').first())
      .count,
    0
  )
  assert.equal(
    (await f.db.prepare('SELECT COUNT(*) AS count FROM comment_likes').first())
      .count,
    0
  )
})

test('shared validation normalizes optional inputs and rejects overlong metadata', async t => {
  const f = fixture(t)
  const normalized = await f.create({
    nick: '  Reader  ',
    content: '  hello  ',
    email: '   ',
    website: '  https://example.com  ',
  })
  assert.equal(normalized.nick, 'Reader')
  assert.equal(normalized.website, 'https://example.com/')
  for (const extra of [
    { title: 'x'.repeat(201) },
    { parent_id: 'x'.repeat(129) },
    { path: '/' + 'x'.repeat(1024) },
    { website: 'https://' },
  ]) {
    assert.equal(
      (
        await f.post({
          path: '/article',
          nick: 'Reader',
          content: 'hello',
          ...extra,
        })
      ).status,
      400
    )
  }
})

test.each([
  '[link](javascript:alert(1))',
  '[link](jav&#x61;script:alert(1))',
  '![image](data:text/html,<script>alert(1)</script>)',
  '<svg onload=alert(1)>',
])('Markdown upgrade does not activate hostile input: %s', source => {
  const html = renderMarkdown(source)
  assert.ok(!/<(?:script|svg|iframe)\b/i.test(html))
  assert.ok(!/(?:href|src)=["'](?:javascript|data):/i.test(html))
})

test('comments collect the request UA and expose parsed labels without the raw header', async t => {
  const f = fixture(t)
  const ua =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.117 Safari/537.36'
  const response = await f.post(
    { path: '/ua', nick: 'Reader', content: 'hello', ua: 'spoofed body value' },
    { 'User-Agent': ua }
  )
  assert.equal(response.status, 201)
  const created = await response.json()
  assert.deepEqual(created.client, {
    browser: 'Chrome 66',
    os: 'macOS 10.13.4',
  })
  assert.ok(!('ua' in created))
  assert.equal(
    (
      await f.db
        .prepare('SELECT ua FROM comments WHERE id = ?')
        .bind(created.id)
        .first()
    ).ua,
    ua
  )
  const reply = await f.post(
    { path: '/ua', nick: 'Reply', content: 'reply', parent_id: created.id },
    { 'User-Agent': ua }
  )
  assert.equal(reply.status, 201)
  const page = await (await f.request('/comments?path=/ua')).json()
  assert.deepEqual(page.comments[0].client, created.client)
  assert.deepEqual(page.comments[0].children[0].client, created.client)
  assert.ok(!('ua' in page.comments[0].children[0]))
  // Historical imports can populate the same column without changing the API.
  await f.db
    .prepare('UPDATE comments SET ua = NULL WHERE id = ?')
    .bind(created.id)
    .run()
  const missing = await (await f.request('/comments?path=/ua')).json()
  assert.ok(!('client' in missing.comments[0]))
})

test('UA storage is bounded and unknown clients do not produce invented labels', async t => {
  const f = fixture(t)
  const response = await f.post(
    { path: '/ua', nick: 'Reader', content: 'hello' },
    { 'User-Agent': 'x'.repeat(3000) }
  )
  assert.equal(response.status, 201)
  const created = await response.json()
  assert.ok(!('client' in created))
  assert.equal(
    (
      await f.db
        .prepare('SELECT length(ua) AS size FROM comments WHERE id = ?')
        .bind(created.id)
        .first()
    ).size,
    2048
  )
})

test.each([
  [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
    { browser: 'Microsoft Edge 140', os: 'Windows 10' },
  ],
  [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    { browser: 'Safari 18', os: 'iOS 18.0' },
  ],
  [
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    { browser: 'Chrome 140', os: 'Android 14' },
  ],
  [
    'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
    { browser: 'Firefox 140', os: 'Linux' },
  ],
  [null, undefined],
])('UA parser recognizes common clients: %s', (ua, expected) => {
  assert.deepEqual(clientInfo(ua), expected)
})
