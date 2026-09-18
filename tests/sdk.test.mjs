import { onTestFinished, test, vi } from 'vitest'
import * as HitalkSDK from '../packages/sdk/src/index.ts'
import assert from 'node:assert/strict'
import { tick, json, list, comment, deferred } from './helpers/comments.mjs'

function fixture(t, handler, beforeMount = () => {}, options = {}) {
  document.body.replaceWith(document.createElement('body'))
  document.body.innerHTML = '<div id="comments"></div>'
  localStorage.clear()
  const storageDescriptor = Object.getOwnPropertyDescriptor(
    window,
    'localStorage'
  )
  let instance
  t.onTestFinished(() => {
    instance?.destroy()
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'localStorage', storageDescriptor)
    document.body.replaceChildren()
  })
  vi.stubGlobal('fetch', handler)
  beforeMount(window)
  window.Hitalk = HitalkSDK
  instance = HitalkSDK.mount('#comments', {
    server: 'https://api.example.com',
    pageSize: 10,
    ...options,
  })
  return { window, document, instance }
}

test('untrusted nickname, website and cached input cannot create event attributes', async t => {
  const payload = '"><img src=x onerror="globalThis.compromised=1">'
  const f = fixture(
    t,
    async () =>
      json(list([comment({ nick: payload, website: 'javascript:alert(1)' })])),
    window => {
      window.localStorage.setItem(
        'HitalkCache',
        JSON.stringify({ nick: payload, email: payload, website: payload })
      )
    }
  )
  await tick()
  assert.equal(f.document.querySelectorAll('[onerror],[onmouseover]').length, 0)
  assert.equal(f.document.querySelector('.vnick').value, payload)
  assert.equal(f.document.querySelector('.vimg').alt, payload)
  assert.equal(
    f.document.querySelector('.vat').getAttribute('data-nick'),
    payload
  )
  assert.equal(f.document.querySelector('.vhead a').getAttribute('href'), '#')
})

test('standalone counters deduplicate canonical paths, batch 50 and fill only their scope', async t => {
  document.body.innerHTML =
    '<span class="hitalk-comment-count" data-xid="/outside">keep</span><main></main>'
  const root = document.querySelector('main')
  const paths = Array.from(
    { length: 53 },
    (_, index) => `/posts/${index}/index.html`
  )
  paths.push('/posts/0/', '/posts/0/index.htm')
  for (const path of paths) {
    const element = document.createElement('span')
    element.className = 'hitalk-comment-count'
    element.setAttribute('data-xid', path)
    element.textContent = '…'
    root.append(element)
  }
  t.onTestFinished(() => document.body.replaceChildren())
  const requests = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    const query = new URL(url)
    assert.equal(query.pathname, '/comments/count')
    const batch = query.searchParams.getAll('paths[]')
    requests.push(batch)
    return json(
      Object.fromEntries(
        batch.map(path => [path, path === '/posts/1/' ? 0 : 7])
      )
    )
  })
  const counts = await HitalkSDK.fillCommentCounts({
    server: 'https://api.example.com/',
    root,
  })
  assert.deepEqual(
    requests.map(batch => batch.length),
    [50, 3]
  )
  assert.equal(Object.keys(counts).length, 53)
  assert.equal(root.firstElementChild.textContent, '7')
  assert.equal(root.children[1].textContent, '0')
  assert.equal(root.lastElementChild.textContent, '7')
  assert.equal(
    document.querySelector('[data-xid="/outside"]').textContent,
    'keep'
  )
  assert.equal(document.querySelector('.veditor'), null)
  assert.deepEqual(
    await HitalkSDK.getCommentCounts('https://api.example.com', []),
    {}
  )
  await assert.rejects(
    HitalkSDK.getCommentCounts('https://api.example.com', ['/post?draft=1']),
    /path/
  )
  assert.equal(requests.length, 2)
})

test('counter failures keep existing text and pending results do not overwrite a reused article element', async t => {
  document.body.innerHTML =
    '<span class="hitalk-comment-count" data-xid="/a">keep</span>'
  t.onTestFinished(() => document.body.replaceChildren())
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(json({ message: 'offline' }, 503))
  await assert.rejects(
    HitalkSDK.fillCommentCounts({ server: 'https://api.example.com' }),
    /offline/
  )
  const element = document.querySelector('span')
  assert.equal(element.textContent, 'keep')
  const pending = deferred()
  fetch.mockImplementation(() => pending.promise)
  const result = HitalkSDK.fillCommentCounts({
    server: 'https://api.example.com',
  })
  element.setAttribute('data-xid', '/b')
  pending.resolve(json({ '/a': 5 }))
  await result
  assert.equal(element.textContent, 'keep')
})

test('nested replies name the actual parent and locate it without moving or clearing a draft', async t => {
  const parent = comment({
    id: 'parent:with/special',
    nick: '<img src=x onerror=alert(1)>',
    parent_id: 'root',
  })
  const child = comment({ id: 'child', nick: 'Child', parent_id: parent.id })
  const f = fixture(t, async () =>
    json(
      list([comment({ id: 'root', nick: 'Root', children: [child, parent] })])
    )
  )
  await tick()
  const target = f.document.getElementById(parent.id)
  const content = target.querySelector('.vcontent')
  content.classList.add('expand')
  const scroll = vi.fn()
  target.scrollIntoView = scroll
  const editor = f.document.querySelector('.veditor')
  editor.value = 'keep my draft'
  const link = f.document.getElementById('child').querySelector('.vreply-to')
  assert.equal(link.textContent.trim(), `回复 @${parent.nick}`)
  assert.equal(link.querySelector('img'), null)
  assert.equal(link.getAttribute('href'), `#${encodeURIComponent(parent.id)}`)
  link.click()
  assert.equal(f.document.activeElement, target)
  assert.equal(scroll.mock.calls.length, 1)
  assert.ok(!content.classList.contains('expand'))
  assert.equal(f.document.querySelector('.veditor'), editor)
  assert.equal(editor.value, 'keep my draft')
  assert.equal(
    f.document
      .getElementById('root')
      .querySelector(':scope > section > .vreply-to'),
    null
  )
  assert.equal(
    target.querySelector('.vreply-to').textContent.trim(),
    '回复 @Root'
  )
})

test.each([
  [['nick'], { nick: 'Cached' }],
  [[], { nick: 'Guest' }],
  [
    ['website', 'email'],
    {
      nick: 'Guest',
      website: 'https://example.com',
      email: 'reader@example.com',
    },
  ],
])(
  'guestFields %j controls both displayed and submitted fields, including cached data',
  async (fields, expected) => {
    let submitted
    const f = fixture(
      { onTestFinished },
      async (_url, init) => {
        if (init.method === 'POST') {
          submitted = JSON.parse(init.body)
          return json(comment(), 201)
        }
        return json(list([]))
      },
      window =>
        window.localStorage.setItem(
          'HitalkCache',
          JSON.stringify({
            nick: 'Cached',
            email: 'reader@example.com',
            website: 'https://example.com',
          })
        ),
      { guestFields: fields }
    )
    await tick()
    assert.deepEqual(
      Array.from(
        f.document.querySelectorAll('.vheader input'),
        input => input.name
      ),
      fields
    )
    if (!fields.includes('nick'))
      assert.equal(f.document.querySelector('.welcome'), null)
    f.document.querySelector('.veditor').value = 'hello'
    f.document.querySelector('.smiles-logo').click()
    f.document.querySelector('.vsubmit').click()
    await tick()
    assert.equal(submitted.nick, expected.nick)
    assert.equal(submitted.email, expected.email)
    assert.equal(submitted.website, expected.website)
  }
)

test('explicit SDK paths are normalized for reads and writes, with invalid paths rejected before replacing an instance', async t => {
  const requests = []
  const f = fixture(
    t,
    async (url, init) => {
      requests.push({ url, body: init.body && JSON.parse(init.body) })
      return init.method === 'POST' ? json(comment(), 201) : json(list([]))
    },
    () => {},
    { path: '/posts/index.html' }
  )
  await tick()
  assert.equal(new URL(requests[0].url).searchParams.get('path'), '/posts/')
  f.document.querySelector('.veditor').value = 'hello'
  f.document.querySelector('.vsubmit').click()
  await tick()
  assert.equal(requests.find(request => request.body).body.path, '/posts/')
  const editor = f.document.querySelector('.veditor')
  assert.throws(
    () =>
      HitalkSDK.mount('#comments', {
        server: 'https://api.example.com',
        path: '/posts/#more',
      }),
    /path/
  )
  assert.equal(f.document.querySelector('.veditor'), editor)
  assert.equal(HitalkSDK.normalizePagePath('/index.htm'), '/')
  assert.equal(
    HitalkSDK.normalizePagePath('/posts/myindex.html'),
    '/posts/myindex.html'
  )
  assert.equal(
    HitalkSDK.normalizePagePath('/index.html/chapter'),
    '/index.html/chapter'
  )
  assert.throws(() => HitalkSDK.normalizePagePath('//example.com'), /path/)
})

test('reply, like and refresh preserve the editor node, draft and updated likes', async t => {
  let likes = 0
  const f = fixture(t, async (url, init) => {
    if (init.method === 'POST') {
      likes++
      return json({ success: true, like_count: likes })
    }
    return json(list([comment({ like_count: likes })]))
  })
  await tick()
  const editor = f.document.querySelector('.veditor')
  editor.value = 'draft survives'
  f.document.querySelector('.vat').click()
  assert.equal(editor.closest('.vcard').id, '123-nanoid')
  f.document.querySelector('.vlike').click()
  await tick()
  assert.equal(f.document.querySelector('.veditor'), editor)
  assert.equal(editor.value, 'draft survives')
  assert.equal(editor.closest('.vcard').id, '123-nanoid')
  assert.equal(f.document.querySelector('.vlike-count').textContent, '1')
  f.document.querySelector('.vcancel-reply').click()
  f.document.querySelector('.vat').click()
  assert.equal(f.document.querySelector('.vlike-count').textContent, '1')
  await f.instance.refresh()
  assert.equal(f.document.querySelector('.veditor'), editor)
  assert.equal(editor.value, 'draft survives')
})

test('submit suppresses double clicks and does not turn cache failure into submission failure', async t => {
  const pending = deferred()
  let posts = 0
  const f = fixture(
    t,
    async (_url, init) => {
      if (init.method === 'POST') {
        posts++
        return pending.promise
      }
      return json(list([comment()]))
    },
    window => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('storage denied')
        },
      })
    }
  )
  await tick()
  const editor = f.document.querySelector('.veditor')
  editor.value = 'new comment'
  f.document.querySelector('.vnick').value = 'Reader'
  const submit = f.document.querySelector('.vsubmit')
  submit.click()
  submit.click()
  assert.equal(posts, 1)
  assert.equal(submit.disabled, true)
  pending.resolve(json(comment(), 201))
  await tick()
  assert.equal(editor.value, '')
  assert.equal(submit.disabled, false)
  assert.equal(
    f.document.querySelector('.hitalk-status').textContent.trim(),
    ''
  )
})

test('errors are visible as text and failed submission retains the draft', async t => {
  const f = fixture(t, async (_url, init) =>
    init.method === 'POST'
      ? json({ message: '<img src=x onerror=alert(1)>' }, 400)
      : json(list([]))
  )
  await tick()
  f.document.querySelector('.veditor').value = 'keep me'
  f.document.querySelector('.vsubmit').click()
  await tick()
  assert.ok(
    f.document.querySelector('.hitalk-status').textContent.includes('<img')
  )
  assert.equal(f.document.querySelector('.hitalk-status img'), null)
  assert.equal(f.document.querySelector('.veditor').value, 'keep me')
})

test('loading more appends roots and requests the configured page size', async t => {
  const requests = []
  const nextPage = deferred()
  const f = fixture(t, async url => {
    requests.push(url)
    const page = Number(new URL(url).searchParams.get('page'))
    if (page === 2) return nextPage.promise
    return json(list([comment({ id: `root-${page}` })], page, page === 1))
  })
  await tick()
  const more = f.document.querySelector('.hitalk-more')
  more.click()
  assert.equal(more.disabled, true)
  assert.equal(more.getAttribute('aria-busy'), 'true')
  assert.equal(more.textContent.trim(), '正在加载…')
  more.click()
  assert.equal(requests.length, 2)
  nextPage.resolve(json(list([comment({ id: 'root-2' })], 2, false)))
  await tick()
  assert.equal(f.document.querySelectorAll('.vcard').length, 2)
  assert.equal(more.hidden, true)
  assert.equal(more.disabled, false)
  assert.equal(more.getAttribute('aria-busy'), 'false')
  assert.ok(requests[1].includes('page=2&pageSize=10'))
})

test('stale loads cannot overwrite the latest response', async t => {
  const pending = deferred()
  let requests = 0
  const f = fixture(t, async () =>
    ++requests === 1 ? pending.promise : json(list([comment({ nick: 'new' })]))
  )
  await f.instance.refresh()
  pending.resolve(json(list([comment({ nick: 'old' })])))
  await tick()
  assert.equal(f.document.querySelector('.vhead a').textContent.trim(), 'new')
})

test('destroy aborts requests and global listeners; late responses cannot revive the component', async t => {
  const pending = deferred()
  let requestSignal, documentSignal
  const f = fixture(
    t,
    async (_url, init) => {
      requestSignal = init.signal
      return pending.promise
    },
    window => {
      const add = window.document.body.addEventListener.bind(
        window.document.body
      )
      window.document.body.addEventListener = (type, listener, options) => {
        if (type === 'mouseup') documentSignal = options.signal
        return add(type, listener, options)
      }
    }
  )
  f.instance.destroy()
  assert.equal(requestSignal.aborted, true)
  assert.equal(documentSignal.aborted, true)
  pending.resolve(json(list([comment()])))
  await tick()
  assert.equal(f.document.querySelector('#comments').childElementCount, 0)
  f.instance.destroy()
})

test('remount destroys the old instance and leaves only the new UI', async t => {
  const f = fixture(t, async () => json(list([comment()])))
  await tick()
  const second = f.window.Hitalk.mount('#comments', {
    server: 'https://api.example.com',
  })
  await tick()
  f.instance.destroy()
  assert.equal(f.document.querySelectorAll('.veditor').length, 1)
  second.destroy()
})

test('a list request started before a successful like cannot reset the count', async t => {
  const pending = deferred()
  let loads = 0
  const f = fixture(t, async (_url, init) => {
    if (init.method === 'POST') return json({ success: true, like_count: 1 })
    if (++loads === 1) return json(list([comment()]))
    return pending.promise
  })
  await tick()
  const refresh = f.instance.refresh()
  f.document.querySelector('.vlike').click()
  await tick()
  pending.resolve(json(list([comment({ like_count: 0 })])))
  await refresh
  assert.equal(f.document.querySelector('.vlike-count').textContent, '1')
})

test('a failed initial load can be retried from the rendered control', async t => {
  let loads = 0
  const f = fixture(t, async () =>
    ++loads === 1
      ? json({ message: 'temporary' }, 503)
      : json(list([comment()]))
  )
  await tick()
  const retry = f.document.querySelector('.hitalk-retry')
  assert.equal(retry.hidden, false)
  retry.click()
  await tick()
  assert.equal(retry.hidden, true)
  assert.equal(f.document.querySelectorAll('.vcard').length, 1)
})

test('keyed roots and replies retain nodes, focus, selection and expanded content when reordered', async t => {
  let reordered = false
  let likes = 0
  const first = comment({
    id: 'root-a',
    children: [
      comment({ id: 'child-a', parent_id: 'root-a' }),
      comment({ id: 'child-b', parent_id: 'root-a' }),
    ],
  })
  const second = comment({ id: 'root-b' })
  const f = fixture(t, async (_url, init) => {
    if (init.method === 'POST')
      return json({ success: true, like_count: ++likes })
    const root = reordered
      ? { ...first, children: [...first.children].reverse() }
      : first
    return json(list(reordered ? [second, root] : [root, second]))
  })
  await tick()
  const root = document.getElementById('root-a')
  const child = document.getElementById('child-a')
  const content = child.querySelector('.vcontent')
  content.classList.add('expand')
  content.click()
  child.querySelector('.vat').click()
  const editor = document.querySelector('.veditor')
  editor.value = 'draft survives reordering'
  editor.setSelectionRange(3, 8, 'backward')
  reordered = true
  await f.instance.refresh()
  assert.equal(document.getElementById('root-a'), root)
  assert.equal(document.getElementById('child-a'), child)
  assert.equal(document.activeElement, editor)
  assert.equal(editor.selectionStart, 3)
  assert.equal(editor.selectionEnd, 8)
  assert.equal(editor.selectionDirection, 'backward')
  assert.equal(editor.value, 'draft survives reordering')
  assert.equal(content.classList.contains('expand'), false)
  assert.deepEqual(
    [...root.querySelectorAll('.vchildren .vcard')].map(node => node.id),
    ['child-b', 'child-a']
  )
  await f.instance.refresh()
  child.querySelector('.vlike').click()
  await tick()
  assert.equal(likes, 1)
  assert.equal(document.getElementById('child-a'), child)
  assert.equal(document.querySelector('.veditor'), editor)
})

test('removing a reply target returns the same focused draft to the top-level editor', async t => {
  let removed = false
  const f = fixture(t, async () => json(list(removed ? [] : [comment()])))
  await tick()
  document.querySelector('.vat').click()
  const editor = document.querySelector('.veditor')
  editor.value = 'keep this unsent reply'
  removed = true
  await f.instance.refresh()
  assert.equal(document.querySelector('.veditor'), editor)
  assert.equal(editor.closest('.vcard'), null)
  assert.equal(document.activeElement, editor)
  assert.equal(editor.value, 'keep this unsent reply')
  assert.equal(
    document.querySelector('.vcancel-reply').classList.contains('dn'),
    true
  )
})

test('emoji category changes and outside closing preserve inputs and insert one emoji', async t => {
  const f = fixture(t, async () => json(list([])))
  await tick()
  const input = document.querySelector('.veditor')
  const nick = document.querySelector('.vnick')
  input.value = 'draft'
  nick.value = 'unsaved nickname'
  document.querySelector('.smiles-logo span').click()
  assert.equal(
    document.querySelector('.smiles').classList.contains('smiles-open'),
    true
  )
  document.querySelector('.smiles-name[data-id="1"] span').click()
  assert.equal(document.querySelector('.smiles-items-show').dataset.id, '1')
  document.querySelector('.smiles-items-show .smiles-item img').click()
  assert.equal(input.value, 'draft #(高兴) ')
  assert.equal(
    document.querySelector('.smiles').classList.contains('smiles-open'),
    false
  )
  assert.equal(document.activeElement, input)
  assert.equal(nick.value, 'unsaved nickname')
  await f.instance.refresh()
  document.querySelector('.smiles-logo').click()
  document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  assert.equal(
    document.querySelector('.smiles').classList.contains('smiles-open'),
    false
  )
  assert.equal(input.value, 'draft #(高兴) ')
})

test('multiple widget instances keep their render roots and lifecycle independent', async t => {
  const f = fixture(t, async () => json(list([comment()])))
  const other = document.createElement('div')
  document.body.append(other)
  const second = HitalkSDK.mount(other, {
    server: 'https://api.example.com',
    path: '/other',
  })
  t.onTestFinished(() => second.destroy())
  await tick()
  const firstEditor = document.querySelector('#comments .veditor')
  const secondEditor = other.querySelector('.veditor')
  firstEditor.value = 'first'
  secondEditor.value = 'second'
  document.querySelector('#comments .vat').click()
  assert.equal(secondEditor.closest('.vcard'), null)
  f.instance.destroy()
  await second.refresh()
  assert.equal(other.querySelector('.veditor'), secondEditor)
  assert.equal(secondEditor.value, 'second')
  assert.equal(document.querySelector('#comments').childElementCount, 0)
})

test('browser and OS labels render for roots and replies as text, and missing UA stays hidden', async t => {
  const malicious = '<img src=x onerror="alert(1)">'
  const f = fixture(t, async () =>
    json(
      list([
        comment({
          id: 'with-ua',
          client: { browser: 'Chrome 66', os: 'macOS 10.13.4' },
          children: [
            comment({
              id: 'reply-ua',
              parent_id: 'with-ua',
              client: { browser: malicious, os: 'Android 14' },
            }),
          ],
        }),
        comment({ id: 'without-ua' }),
      ])
    )
  )
  await tick()
  assert.equal(
    f.document
      .querySelector('#with-ua > section > .vhead .vua')
      .textContent.trim(),
    'Chrome 66 · macOS 10.13.4'
  )
  assert.ok(
    f.document.querySelector('#reply-ua .vua').textContent.includes(malicious)
  )
  assert.equal(f.document.querySelector('.vua img'), null)
  assert.equal(f.document.querySelector('#without-ua .vua'), null)
})
