import { test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { mount } from '../packages/sdk/src/index.ts'
import { HitalkAPI } from '../packages/sdk/src/api.ts'
import { VisitorIdentity } from '../packages/sdk/src/identity.ts'
import { tick, json, list, comment, deferred } from './helpers/comments.mjs'
function fixture(t, handler, options = {}) {
  localStorage.clear()
  sessionStorage.clear()
  document.body.innerHTML = '<div id="comments"></div>'
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_key, fn) => fn() },
  })
  HTMLElement.prototype.scrollIntoView = vi.fn()
  const requests = []
  vi.stubGlobal('fetch', async (url, init = {}) => {
    requests.push({ url: String(url), init })
    return handler(String(url), init)
  })
  const instance = mount('#comments', {
    server: 'https://api.example.com/api',
    ...options,
  })
  t.onTestFinished(() => {
    instance.destroy()
    vi.unstubAllGlobals()
  })
  const submit = (content = 'hello') => {
    document.querySelector('.veditor').value = content
    document.querySelector('.vcontrol > .vbtn').click()
  }
  return { instance, requests, submit }
}
test('read does not create identity; concurrent initial identity use is stable and namespaced', async t => {
  const f = fixture(t, () => json(list([])))
  await tick()
  assert.equal(localStorage.length, 0)
  const identity = new VisitorIdentity('https://api.example.com/api')
  const tokens = await Promise.all([identity.ensure(), identity.ensure()])
  assert.equal(tokens[0], tokens[1])
  assert.match(tokens[0], /^ht_[A-Za-z0-9_-]{43}$/)
  assert.equal(
    new VisitorIdentity('https://other.example.com/api').read(),
    null
  )
  assert.equal(f.requests[0].init.headers.get('Authorization'), null)
})
test('feedback distinguishes sending and success while keeping the live region mounted', async t => {
  const response = deferred()
  const f = fixture(
    t,
    (url, init) => {
      if (init.method === 'POST') return response.promise
      if (url.includes('/count?')) return json({ '/article': 1 })
      return json(list([]))
    },
    { path: '/article' }
  )
  await tick()
  const liveRegion = document.querySelector('.hitalk-status')
  assert.equal(
    document.querySelector('.hitalk-feedback').dataset.visible,
    'false'
  )
  f.submit()
  await tick()
  assert.equal(
    document.querySelector('.hitalk-feedback').dataset.kind,
    'loading'
  )
  assert.equal(
    document.querySelector('.hitalk-feedback-title').textContent,
    '发送中'
  )
  assert.equal(
    document.querySelector('.hitalk-feedback-icon').hasAttribute('hidden'),
    false
  )
  response.resolve(json(comment(), 201))
  await tick()
  assert.equal(
    document.querySelector('.hitalk-feedback').dataset.kind,
    'success'
  )
  assert.equal(
    document.querySelector('.hitalk-feedback-title').textContent,
    '操作成功'
  )
  assert.equal(document.querySelector('.hitalk-status'), liveRegion)
  assert.equal(liveRegion.getAttribute('aria-atomic'), 'true')
})

test('repeated feedback replays gentle motion and respects reduced motion without touching drafts', async t => {
  const f = fixture(t, () => json(list([])))
  await tick()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const feedback = document.querySelector('.hitalk-feedback')
  const animate = vi.fn()
  feedback.animate = animate
  const textarea = document.querySelector('.veditor')
  f.submit(' ')
  f.submit(' ')
  assert.equal(feedback.dataset.kind, 'error')
  assert.equal(animate.mock.calls.length, 2)
  assert.equal(document.querySelector('.veditor'), textarea)
  assert.equal(textarea.value, ' ')
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  f.submit(' ')
  assert.equal(animate.mock.calls.length, 2)
  assert.match(
    document.querySelector('.hitalk-status').textContent,
    /请先填写评论内容/
  )
})

test('completed profile folds to nickname, edits preserve the draft, and cached profile stays folded', async t => {
  const bodies = []
  const f = fixture(
    t,
    (url, init) => {
      if (init.method === 'POST') {
        bodies.push(JSON.parse(init.body))
        return json(comment(), 201)
      }
      if (url.includes('/count?')) return json({ '/article': 1 })
      return json(list([]))
    },
    { path: '/article' }
  )
  await tick()
  assert.equal(document.querySelector('.vheader').hidden, false)
  document.querySelector('.vnick').value = ' 小夏 '
  document.querySelector('.vmail').value = 'reader@example.com'
  document.querySelector('.vlink').value = 'https://example.com'
  document.querySelector('.vnotify').checked = true
  const textarea = document.querySelector('.veditor')
  textarea.value = '保留正在写的评论'
  textarea.focus()
  assert.equal(document.querySelector('.vheader').hidden, true)
  assert.equal(document.querySelector('.vprofile').hidden, false)
  assert.equal(document.querySelector('.vprofile-nick').textContent, '小夏')
  const saved = JSON.parse(
    sessionStorage.getItem('hitalk:draft:https://api.example.com/api:/article')
  )
  assert.equal(saved.fields.nick, '小夏')
  assert.equal(saved.fields.content, textarea.value)
  assert.equal(
    localStorage.getItem('hitalk:identity:https://api.example.com/api'),
    null
  )
  document.querySelector('.vprofile-edit').click()
  assert.equal(document.querySelector('.vheader').hidden, false)
  assert.equal(document.activeElement, document.querySelector('.vnick'))
  assert.equal(document.querySelector('.vmail').value, 'reader@example.com')
  document.querySelector('.vnick').value = '新昵称'
  textarea.focus()
  assert.equal(document.querySelector('.vprofile-nick').textContent, '新昵称')
  assert.equal(document.querySelector('.veditor'), textarea)
  assert.equal(textarea.value, '保留正在写的评论')
  assert.equal(document.querySelector('.vnotify').checked, true)
  f.submit(textarea.value)
  await tick()
  assert.equal(bodies[0].nick, '新昵称')
  assert.equal(bodies[0].email, 'reader@example.com')
  assert.equal(bodies[0].website, 'https://example.com')
  assert.equal(bodies[0].notify, true)
  const next = mount('#comments', {
    server: 'https://api.example.com/api',
    path: '/article',
  })
  t.onTestFinished(() => next.destroy())
  await tick()
  assert.equal(document.querySelector('.vheader').hidden, true)
  assert.equal(document.querySelector('.vprofile-nick').textContent, '新昵称')
})

test('invalid profile and restored unsaved edits remain expanded', async t => {
  fixture(t, () => json(list([])), { path: '/article' })
  await tick()
  document.querySelector('.vnick').value = '小夏'
  document.querySelector('.vmail').value = 'invalid-email'
  document.querySelector('.veditor').focus()
  assert.equal(document.querySelector('.vheader').hidden, false)
  document.querySelector('.vmail').value = 'reader@example.com'
  document.querySelector('.vnick').focus()
  document.querySelector('.veditor').focus()
  assert.equal(document.querySelector('.vheader').hidden, true)
  document.querySelector('.vprofile-edit').click()
  const input = document.querySelector('.vmail')
  input.value = 'unfinished-edit'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  const next = mount('#comments', {
    server: 'https://api.example.com/api',
    path: '/article',
  })
  t.onTestFinished(() => next.destroy())
  await tick()
  assert.equal(document.querySelector('.vheader').hidden, false)
  assert.equal(document.querySelector('.vmail').value, 'unfinished-edit')
})

test('successful submission stores identity first, uses response and preserves current page', async t => {
  let calls = 0
  const f = fixture(
    t,
    (url, init) => {
      if (init.method === 'POST') {
        assert.ok(
          localStorage.getItem('hitalk:identity:https://api.example.com/api')
        )
        calls++
        return json(comment({ id: 'new', can_delete: true }), 201)
      }
      if (url.includes('/count?')) return json({ '/article': 3 })
      return json(list([comment({ id: 'existing' })], 'next'))
    },
    { path: '/article' }
  )
  await tick()
  f.submit()
  await tick()
  assert.equal(calls, 1)
  assert.equal(document.querySelectorAll('.vcard').length, 2)
  assert.equal(document.querySelector('.veditor').value, '')
  assert.match(document.querySelector('.hitalk-status').textContent, /已发送/)
  assert.equal(f.requests.filter(r => r.url.includes('/comments?')).length, 1)
})
test('uncertain submission retries same key, changed content gets new key', async t => {
  const bodies = []
  let succeed = false
  const f = fixture(
    t,
    (url, init) => {
      if (init.method === 'POST') {
        bodies.push(JSON.parse(init.body))
        if (!succeed) throw new Error('network')
        return json(comment(), 201)
      }
      if (url.includes('/count?')) return json({ '/article': 1 })
      return json(list([]))
    },
    { path: '/article' }
  )
  await tick()
  f.submit('draft')
  await tick()
  assert.equal(document.querySelector('.veditor').value, 'draft')
  assert.match(document.querySelector('.hitalk-status').textContent, /暂未确认/)
  f.submit('draft')
  await tick()
  assert.equal(bodies[0].client_request_id, bodies[1].client_request_id)
  succeed = true
  f.submit('edited')
  await tick()
  assert.notEqual(bodies[1].client_request_id, bodies[2].client_request_id)
})
test('pending submission restores across remount, including retry identifier', async t => {
  const bodies = []
  const f = fixture(t, (url, init) => {
    if (init.method === 'POST') {
      bodies.push(JSON.parse(init.body))
      throw new Error('offline')
    }
    return json(list([]))
  })
  await tick()
  f.submit('keep me')
  await tick()
  f.instance.destroy()
  const next = mount('#comments', { server: 'https://api.example.com/api' })
  t.onTestFinished(() => next.destroy())
  await tick()
  assert.equal(document.querySelector('.veditor').value, 'keep me')
  document.querySelector('.vcontrol > .vbtn').click()
  await tick()
  assert.equal(bodies[0].client_request_id, bodies[1].client_request_id)
})
test('pending comments show private receipt and do not increase public count', async t => {
  const f = fixture(t, (_url, init) =>
    init.method === 'POST'
      ? json(
          comment({ status: 'pending', can_reply: false, can_delete: true }),
          201
        )
      : json(list([]))
  )
  await tick()
  f.submit()
  await tick()
  assert.match(document.querySelector('.hitalk-status').textContent, /审核/)
  assert.equal(document.querySelector('.count').textContent, '评论(0)')
  assert.equal(document.querySelector('.vat'), null)
})
test('double click submits once while pending and failed cache does not duplicate confirmed creation', async t => {
  const wait = deferred()
  let writes = 0
  const f = fixture(
    t,
    (url, init) => {
      if (init.method === 'POST') {
        writes++
        return wait.promise
      }
      if (url.includes('/count?')) return json({ '/article': 1 })
      return json(list([]))
    },
    { path: '/article' }
  )
  await tick()
  f.submit()
  f.submit()
  await tick()
  assert.equal(writes, 1)
  wait.resolve(json(comment(), 201))
  await tick()
  assert.equal(document.querySelector('.veditor').value, '')
})
test('reply and like preserve editor node, focus and draft; unlike sends DELETE', async t => {
  const methods = []
  fixture(t, (url, init) => {
    if (url.endsWith('/like')) {
      methods.push(init.method)
      return json({
        liked: init.method === 'PUT',
        like_count: init.method === 'PUT' ? 1 : 0,
      })
    }
    return json(list([comment()]))
  })
  await tick()
  const editor = document.querySelector('.veditor')
  editor.value = 'my draft'
  document.querySelector('.vat').click()
  document.querySelector('.vlike').click()
  await tick()
  assert.equal(document.querySelector('.veditor'), editor)
  assert.equal(editor.value, 'my draft')
  assert.equal(document.querySelector('.vlike-count').textContent, '1')
  document.querySelector('.vlike').click()
  await tick()
  assert.deepEqual(methods, ['PUT', 'DELETE'])
})
test('reply pagination is independent and keeps existing replies', async t => {
  const r = comment({
    id: 'root',
    replies: [comment({ id: 'a', root_id: 'root' })],
    reply_cursor: 'more',
    reply_count: 2,
  })
  fixture(t, url =>
    url.includes('/replies?')
      ? json({
          comments: [comment({ id: 'b', root_id: 'root' })],
          next_cursor: null,
        })
      : json(list([r]))
  )
  await tick()
  document.querySelector('.vmore-replies').click()
  await tick()
  assert.equal(document.querySelectorAll('.vcard').length, 3)
  assert.equal(document.querySelector('.vmore-replies'), null)
})
test('opaque comment anchors load and focus comments outside the first page', async t => {
  const previousURL = location.href
  const id = '5ad9f7779f54540038c33b11'
  history.replaceState(null, '', `#${id}`)
  t.onTestFinished(() => history.replaceState(null, '', previousURL))
  const f = fixture(t, url =>
    url.endsWith(`/${id}/context`)
      ? json({ root: comment({ id, replies: [] }), target_id: id })
      : json(list([]))
  )
  await tick()
  await tick()
  assert.equal(f.requests.filter(r => r.url.endsWith('/context')).length, 1)
  assert.equal(document.activeElement.id, id)
  assert.equal(HTMLElement.prototype.scrollIntoView.mock.calls.length, 1)
})
test('host comment anchors do not trigger comment context requests', async t => {
  const previousURL = location.href
  history.replaceState(null, '', '#comments')
  t.onTestFinished(() => history.replaceState(null, '', previousURL))
  const f = fixture(t, () => json(list([])))
  await tick()
  assert.equal(f.requests.filter(r => r.url.endsWith('/context')).length, 0)
})
test('unloaded reply target is fetched by context without clearing draft', async t => {
  const child = comment({
    id: 'child',
    root_id: 'root',
    reply_to: { id: 'target', nick: 'Parent', available: true },
  })
  fixture(t, url =>
    url.endsWith('/target/context')
      ? json({
          root: comment({
            id: 'root',
            replies: [comment({ id: 'target', root_id: 'root' })],
          }),
          target_id: 'target',
        })
      : json(list([comment({ id: 'root', replies: [child] })]))
  )
  await tick()
  document.querySelector('.veditor').value = 'draft'
  document.querySelector('.vreply-to').click()
  await tick()
  assert.ok(document.getElementById('target'))
  assert.equal(document.querySelector('.veditor').value, 'draft')
  assert.equal(document.activeElement.id, 'target')
})
test('author delete preserves replies and removes author controls', async t => {
  fixture(
    t,
    (url, init) => {
      if (init.method === 'DELETE') return json({ success: true })
      if (url.includes('/count?')) return json({ '/article': 1 })
      return json(
        list([
          comment({
            id: 'root',
            can_delete: true,
            replies: [comment({ id: 'reply', root_id: 'root' })],
          }),
        ])
      )
    },
    { path: '/article' }
  )
  await tick()
  document.querySelector('.vdelete').click()
  await tick()
  assert.equal(document.querySelectorAll('.vcard').length, 2)
  assert.equal(document.querySelector('.vdelete'), null)
  assert.match(document.getElementById('root').textContent, /已删除/)
})
test('stale list response cannot undo confirmed like', async t => {
  const wait = deferred()
  let gets = 0
  const f = fixture(t, (url, init) => {
    if (init.method === 'PUT') return json({ liked: true, like_count: 5 })
    gets++
    return gets === 1 ? json(list([comment()])) : wait.promise
  })
  await tick()
  const loading = f.instance.refresh()
  document.querySelector('.vlike').click()
  await tick()
  wait.resolve(json(list([comment({ like_count: 0 })])))
  await loading
  assert.equal(document.querySelector('.vlike-count').textContent, '5')
})
test('latest refresh wins and load more uses cursor instead of offset', async t => {
  const wait = deferred()
  let gets = 0
  const f = fixture(t, url => {
    gets++
    if (gets === 1) return json(list([comment({ id: 'a' })], 'cursor'))
    if (url.includes('cursor=')) return json(list([comment({ id: 'b' })]))
    if (gets === 3) return wait.promise
    return json(list([comment({ id: 'latest' })]))
  })
  await tick()
  document.querySelector('.hitalk-more').click()
  await tick()
  assert.equal(document.querySelectorAll('.vcard').length, 2)
  const old = f.instance.refresh()
  await f.instance.refresh()
  wait.resolve(json(list([comment({ id: 'old' })])))
  await old
  assert.ok(document.getElementById('latest'))
  assert.equal(document.getElementById('old'), null)
})
test('destroy cancels requests and late responses cannot resurrect DOM', async t => {
  const wait = deferred()
  const f = fixture(t, () => wait.promise)
  await tick()
  const signal = f.requests[0].init.signal
  f.instance.destroy()
  assert.equal(signal.aborted, true)
  wait.resolve(json(list([comment()])))
  await tick()
  assert.equal(document.querySelector('.vcard'), null)
  f.instance.destroy()
})
test('remount and multiple widgets have isolated DOM and shared identity', async t => {
  const f = fixture(t, () => json(list([comment()])))
  await tick()
  const second = document.createElement('div')
  document.body.append(second)
  const next = mount(second, { server: 'https://api.example.com/api' })
  t.onTestFinished(() => next.destroy())
  await tick()
  assert.equal(document.querySelectorAll('.veditor').length, 2)
  f.instance.destroy()
  assert.equal(second.querySelectorAll('.veditor').length, 1)
})
test('errors are text, can reload and show Retry-After', async t => {
  let fail = true
  const f = fixture(t, (_url, init) => {
    if (init.method === 'POST')
      return new Response(
        JSON.stringify({ code: 'RATE_LIMITED', message: 'limited' }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '30' },
        }
      )
    return fail
      ? json({ message: '<img onerror=alert(1)>', code: 'ERROR' }, 500)
      : json(list([]))
  })
  await tick()
  assert.equal(document.querySelector('.hitalk-status img'), null)
  assert.equal(document.querySelector('.hitalk-retry').hidden, false)
  fail = false
  document.querySelector('.hitalk-retry').click()
  await tick()
  f.submit()
  await tick()
  assert.match(document.querySelector('.hitalk-status').textContent, /30 秒/)
})
test('API malformed responses, errors and explicit destruction are handled', async t => {
  fixture(t, () => new Response('not JSON'))
  const api = new HitalkAPI('https://api.example.com/api')
  await assert.rejects(() => api.fetchComments('/a'), /响应无效/)
  api.destroy()
  await assert.rejects(() => api.fetchComments('/a'), /destroyed/)
  assert.throws(
    () => new HitalkAPI('http://untrusted.example.com/api'),
    /HTTPS/
  )
  assert.throws(() => new HitalkAPI(''), /server/)
})
test('disabled page and invalid input never submit', async t => {
  const f = fixture(t, () => json({ ...list([]), comments_enabled: false }))
  await tick()
  assert.equal(document.querySelector('.editor-container').hidden, true)
  f.submit()
  await tick()
  assert.equal(
    f.requests.some(r => r.init.method === 'POST'),
    false
  )
  assert.match(document.querySelector('.hitalk-status').textContent, /关闭/)
})
test('closing and reopening comments hides the editor without losing its draft', async t => {
  let enabled = true
  const f = fixture(t, () =>
    json({ ...list([comment()]), comments_enabled: enabled })
  )
  assert.equal(document.querySelector('.editor-container').hidden, true)
  await tick()
  const editor = document.querySelector('.editor-container')
  const textarea = document.querySelector('.veditor')
  textarea.value = '保留这段草稿'
  assert.equal(editor.hidden, false)
  enabled = false
  await f.instance.refresh()
  assert.equal(editor.hidden, true)
  assert.equal(
    document.querySelector('.hitalk-root').dataset.commentsEnabled,
    'false'
  )
  document.querySelector('.vat').click()
  assert.equal(document.querySelector('.vreplying'), null)
  enabled = true
  await f.instance.refresh()
  assert.equal(editor.hidden, false)
  assert.equal(document.querySelector('.veditor'), textarea)
  assert.equal(textarea.value, '保留这段草稿')
  assert.match(document.querySelector('.hitalk-status').textContent, /重新开放/)
})

test('a page closed during submission hides the editor and keeps the rejected draft', async t => {
  const f = fixture(t, (_url, init) =>
    init.method === 'POST'
      ? json({ code: 'COMMENTS_CLOSED', message: '评论已关闭' }, 403)
      : json(list([]))
  )
  await tick()
  f.submit('发送中关闭的草稿')
  await tick()
  assert.equal(document.querySelector('.editor-container').hidden, true)
  assert.equal(document.querySelector('.veditor').value, '发送中关闭的草稿')
})

test('hidden guest fields cannot be restored or submitted from profile cache', async t => {
  const bodies = []
  const f = fixture(
    t,
    (url, init) => {
      if (init.method === 'POST') {
        bodies.push(JSON.parse(init.body))
        return json(comment(), 201)
      }
      if (url.includes('/count?')) return json({ '/article': 1 })
      return json(list([]))
    },
    { guestFields: [], path: '/article' }
  )
  await tick()
  f.submit()
  await tick()
  assert.equal(bodies[0].nick, 'Guest')
  assert.equal(bodies[0].email, undefined)
  assert.equal(document.querySelector('.vnick'), null)
})
test('untrusted nickname and reply summaries remain text', async t => {
  fixture(t, () =>
    json(
      list([
        comment({
          nick: '<img src=x onerror=alert(1)>',
          reply_to: {
            id: 'none',
            nick: '<svg/onload=alert(1)>',
            available: false,
          },
          client: { browser: '<script>bad</script>' },
        }),
      ])
    )
  )
  await tick()
  assert.equal(document.querySelector('.vhead script'), null)
  assert.equal(document.querySelector('.vreply-to svg'), null)
  assert.equal(document.querySelector('.vreply-to').disabled, true)
})
test('invalid configuration does not destroy the existing instance', async t => {
  fixture(t, () => json(list([comment()])))
  await tick()
  const node = document.querySelector('.veditor')
  for (const opts of [
    { path: 'bad' },
    { pageSize: 0 },
    { guestFields: ['bad'] },
  ])
    assert.throws(() =>
      mount('#comments', { server: 'https://api.example.com/api', ...opts })
    )
  assert.equal(document.querySelector('.veditor'), node)
})

test('standalone counters batch canonical paths, preserve text on error and avoid reused elements', async t => {
  const { getCommentCounts, fillCommentCounts } =
    await import('../packages/sdk/src/counts.ts')
  const f = fixture(t, url => {
    const query = new URL(url)
    if (query.pathname.endsWith('/count'))
      return json(
        Object.fromEntries(
          query.searchParams.getAll('paths[]').map(path => [path, 3])
        )
      )
    return json(list([]))
  })
  await tick()
  const paths = Array.from({ length: 55 }, (_, i) => `/a${i}`)
  const counts = await getCommentCounts('https://api.example.com/api', [
    ...paths,
    '/a0/index.html',
    '/a0/',
  ])
  assert.equal(counts['/a0/'], 3)
  assert.equal(f.requests.filter(r => r.url.includes('/count?')).length, 2)
  const host = document.createElement('div')
  host.innerHTML = '<span class="hitalk-comment-count" data-xid="/a0">—</span>'
  document.body.append(host)
  await fillCommentCounts({ server: 'https://api.example.com/api', root: host })
  assert.equal(host.textContent, '3')
  const wait = deferred()
  vi.stubGlobal('fetch', () => wait.promise)
  const result = fillCommentCounts({
    server: 'https://api.example.com/api',
    root: host,
  })
  await tick()
  host.firstChild.setAttribute('data-xid', '/different')
  wait.resolve(json({ '/a0': 99 }))
  await result
  assert.equal(host.textContent, '3')
  vi.stubGlobal('fetch', () => Promise.resolve(json({ message: 'error' }, 500)))
  await assert.rejects(() =>
    fillCommentCounts({ server: 'https://api.example.com/api', root: host })
  )
  assert.equal(host.textContent, '3')
  await assert.rejects(() => getCommentCounts('', paths))
})

test('emoji category/selection and outside dismissal preserve the editor draft', async t => {
  fixture(t, () => json(list([])))
  await tick()
  const textarea = document.querySelector('.veditor')
  textarea.value = 'draft'
  document.querySelector('[aria-label="插入表情"]').click()
  document.querySelectorAll('.smiles-name')[1].click()
  document.querySelector('.smiles-items-show .smiles-item').click()
  assert.match(textarea.value, /draft #\(/)
  assert.equal(document.querySelector('.smiles-body'), null)
  document.querySelector('[aria-label="插入表情"]').click()
  document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  assert.equal(document.querySelector('.smiles-body'), null)
  assert.ok(textarea.value.startsWith('draft'))
})

test('unavailable persistent identity storage rejects write before network and retains draft', async t => {
  const f = fixture(t, () => json(list([])))
  await tick()
  const original = Object.getOwnPropertyDescriptor(
    Storage.prototype,
    'setItem'
  ).value
  const failure = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(function (key, value) {
      if (key.startsWith('hitalk:identity:')) throw new Error('blocked')
      return original.call(this, key, value)
    })
  f.submit('still here')
  await tick()
  assert.equal(
    f.requests.some(r => r.init.method === 'POST'),
    false
  )
  assert.equal(document.querySelector('.veditor').value, 'still here')
  failure.mockRestore()
})

test('pending receipt survives remount and refresh with the anonymous credential', async t => {
  const pending = comment({
    status: 'pending',
    can_reply: false,
    can_delete: true,
  })
  const f = fixture(t, (url, init) =>
    init.method === 'POST'
      ? json(pending, 201)
      : url.includes('/me/comments?')
        ? json({ comments: [pending], next: null })
        : json(list([]))
  )
  await tick()
  f.submit()
  await tick()
  f.instance.destroy()
  const next = mount('#comments', { server: 'https://api.example.com/api' })
  t.onTestFinished(() => next.destroy())
  await tick()
  assert.equal(document.querySelectorAll('.vcard').length, 1)
  assert.match(document.querySelector('.vcard').textContent, /审核中/)
  assert.equal(document.querySelector('.count').textContent, '评论(0)')
})
test('deleting the last visible content removes the empty root and clears reply references', async t => {
  const root = comment({
    id: 'root',
    can_delete: true,
    reply_count: 1,
    replies: [
      comment({
        id: 'reply',
        root_id: 'root',
        can_delete: true,
        reply_to: { id: 'root', nick: 'Reader', available: true },
      }),
    ],
  })
  fixture(
    t,
    (url, init) =>
      init.method === 'DELETE'
        ? json({ success: true })
        : url.includes('/count?')
          ? json({ '/article': 0 })
          : json(list([root])),
    { path: '/article' }
  )
  await tick()
  document.querySelector('#root > section .vdelete').click()
  await tick()
  assert.equal(document.querySelector('.vreply-to').disabled, true)
  document.querySelector('#reply .vdelete').click()
  await tick()
  assert.equal(document.querySelector('.vcard'), null)
})
