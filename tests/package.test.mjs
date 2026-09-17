import { test } from 'vitest'
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

const sdk = readFileSync(
  new URL('../packages/sdk/dist/hitalk.js', import.meta.url),
  'utf8'
)
import { tick, json, list, comment } from './helpers/comments.mjs'

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

test('standalone browser bundle renders, preserves drafts and respects hidden buttons with bundled CSS', async t => {
  const dom = new JSDOM('<div id="comments"></div>', {
    url: 'https://example.com/article',
    runScripts: 'outside-only',
  })
  const style = dom.window.document.createElement('style')
  style.textContent = readFileSync(
    new URL('../packages/sdk/dist/hitalk.css', import.meta.url),
    'utf8'
  )
  dom.window.document.head.append(style)
  let likeRequests = 0
  dom.window.fetch = async url => {
    if (String(url).endsWith('/like')) {
      likeRequests++
      return json({ success: true, like_count: likeRequests })
    }
    return json(list([comment()]))
  }
  runInContext(sdk, dom.getInternalVMContext())
  const instance = dom.window.Hitalk.mount('#comments', {
    server: 'https://api.example.com',
  })
  t.onTestFinished(() => {
    instance.destroy()
    dom.window.close()
  })
  await tick()
  const document = dom.window.document
  const textarea = document.querySelector('.veditor')
  textarea.value = 'draft from the shipped bundle'
  document.querySelector('.vat').click()
  document.querySelector('.vlike').click()
  await tick()
  assert.equal(document.querySelectorAll('.veditor').length, 1)
  assert.equal(document.querySelector('.veditor'), textarea)
  assert.equal(textarea.value, 'draft from the shipped bundle')
  assert.equal(document.querySelector('.vlike-count').textContent, '1')
  assert.equal(likeRequests, 1)
  for (const selector of ['.hitalk-more', '.hitalk-retry'])
    assert.equal(
      dom.window.getComputedStyle(document.querySelector(selector)).display,
      'none'
    )
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
