import { test } from 'vitest'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { runInContext } from 'node:vm'
import { adminPage } from '../apps/server/src/ui/admin-page.ts'
import { tick, json, comment } from './helpers/comments.mjs'

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
