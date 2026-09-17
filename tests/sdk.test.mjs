import { test, vi } from 'vitest'
import * as HitalkSDK from '../packages/sdk/src/index.ts'
import assert from 'node:assert/strict'
import {
  readFileSync,
  existsSync,
  mkdtempSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import { adminPage } from '../apps/server/src/ui/admin-page.ts'

const sdk = readFileSync(
  new URL('../packages/sdk/dist/hitalk.js', import.meta.url),
  'utf8'
)
const tick = async () => {
  for (let i = 0; i < 6; i++)
    await new Promise(resolve => setImmediate(resolve))
}
const comment = (overrides = {}) => ({
  id: '123-nanoid',
  parent_id: null,
  nick: 'Reader',
  avatar_hash: 'a'.repeat(32),
  content_html: '<p>hello</p>',
  like_count: 0,
  is_admin: false,
  is_pinned: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  children: [],
  ...overrides,
})
const list = (comments, page = 1, more = false) => ({
  comments,
  total: comments.length,
  page_info: { path: '/article', comment_count: comments.length },
  pagination: { page, page_size: 10, has_more: more },
})
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
function deferred() {
  let resolve
  const promise = new Promise(done => {
    resolve = done
  })
  return { promise, resolve }
}

function fixture(t, handler, beforeMount = () => {}) {
  const dom = new JSDOM('<div id="comments"></div>', {
    url: 'https://example.com/article',
    runScripts: 'outside-only',
  })
  dom.window.fetch = handler
  beforeMount(dom.window)
  for (const key of [
    'window',
    'document',
    'location',
    'HTMLElement',
    'AbortController',
  ])
    vi.stubGlobal(key, key === 'window' ? dom.window : dom.window[key])
  const storageDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage'
  )
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => dom.window.localStorage,
  })
  vi.stubGlobal('fetch', handler)
  dom.window.Hitalk = HitalkSDK
  const instance = dom.window.Hitalk.mount('#comments', {
    server: 'https://api.example.com',
    pageSize: 10,
  })
  t.onTestFinished(() => {
    instance.destroy()
    vi.unstubAllGlobals()
    if (storageDescriptor)
      Object.defineProperty(globalThis, 'localStorage', storageDescriptor)
    else delete globalThis.localStorage
    dom.window.close()
  })
  return { dom, window: dom.window, document: dom.window.document, instance }
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
  assert.equal(f.document.querySelector('.hitalk-status').textContent, '')
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
  const f = fixture(t, async url => {
    requests.push(url)
    const page = Number(new URL(url).searchParams.get('page'))
    return json(list([comment({ id: `root-${page}` })], page, page === 1))
  })
  await tick()
  f.document.querySelector('.hitalk-more').click()
  await tick()
  assert.equal(f.document.querySelectorAll('.vcard').length, 2)
  assert.equal(f.document.querySelector('.hitalk-more').hidden, true)
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

test('admin renders hostile source Markdown and nickname as text, sends credentials only in headers', async t => {
  const dom = new JSDOM(adminPage, {
    url: 'https://example.com/admin?token=legacy',
    runScripts: 'outside-only',
  })
  t.onTestFinished(() => dom.window.close())
  const requests = []
  dom.window.fetch = async (url, init) => {
    requests.push({ url, init })
    return json({
      comments: [
        {
          ...comment(),
          content_md: '"><img src=x onerror=alert(1)>',
          nick: '<script>bad</script>',
          email: 'person@example.invalid',
          page_path: '/article',
        },
      ],
      has_more: false,
    })
  }
  runInContext(
    dom.window.document.querySelector('script').textContent,
    dom.getInternalVMContext()
  )
  const input = dom.window.document.querySelector('#token')
  input.value = 'test-admin'
  dom.window.document
    .querySelector('#login')
    .dispatchEvent(new dom.window.Event('submit', { cancelable: true }))
  await tick()
  assert.equal(dom.window.location.search, '')
  assert.equal(requests[0].init.headers.Authorization, 'Bearer test-admin')
  assert.ok(!requests[0].url.includes('token'))
  assert.equal(input.value, '')
  assert.equal(
    dom.window.document.querySelectorAll(
      '#list img, #list script, #list [onerror]'
    ).length,
    0
  )
  assert.ok(
    dom.window.document
      .querySelector('#list')
      .textContent.includes('<script>bad</script>')
  )
})

test('package entrypoints and bundled declarations exist independently of workspace types', async () => {
  const root = new URL('../packages/sdk/', import.meta.url)
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
  for (const path of [
    pkg.main,
    pkg.module,
    pkg.types,
    'dist/hitalk.js',
    'dist/hitalk.css',
  ])
    assert.ok(existsSync(new URL(path, root)), path)
  const declarations = readFileSync(new URL(pkg.types, root), 'utf8')
  assert.ok(!declarations.includes('@hitalk/shared'))
  assert.ok(declarations.includes('destroy(): void'))
  assert.equal(
    typeof (await import(new URL(pkg.module, root).href)).mount,
    'function'
  )
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

test('standalone browser bundle exposes mount without a module loader', async t => {
  const dom = new JSDOM('<div id="comments"></div>', {
    url: 'https://example.com/article',
    runScripts: 'outside-only',
  })
  dom.window.fetch = async () => json(list([]))
  runInContext(sdk, dom.getInternalVMContext())
  const instance = dom.window.Hitalk.mount('#comments', {
    server: 'https://api.example.com',
  })
  t.onTestFinished(() => {
    instance.destroy()
    dom.window.close()
  })
  await tick()
  assert.equal(dom.window.document.querySelectorAll('.veditor').length, 1)
})

test('published declarations typecheck without workspace or dependency access', t => {
  const directory = mkdtempSync(join(tmpdir(), 'hitalk-types-'))
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  copyFileSync(
    new URL('../packages/sdk/dist/hitalk.d.ts', import.meta.url),
    join(directory, 'hitalk.d.ts')
  )
  writeFileSync(
    join(directory, 'consumer.ts'),
    `import { mount, type CommentCreateRequest } from './hitalk';
const request: CommentCreateRequest = { path: '/article', nick: 'Reader', content: '**hello**' };
const instance = mount('#comments', { server: 'https://example.com', path: request.path });
void instance.refresh(); instance.destroy();`
  )
  writeFileSync(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
        types: [],
        lib: ['ES2022', 'DOM'],
      },
      include: ['consumer.ts'],
    })
  )
  assert.doesNotThrow(() =>
    execFileSync(
      process.execPath,
      [
        fileURLToPath(
          new URL('../node_modules/typescript/bin/tsc', import.meta.url)
        ),
        '-p',
        join(directory, 'tsconfig.json'),
      ],
      { stdio: 'pipe' }
    )
  )
})
