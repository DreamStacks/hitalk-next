import { test } from 'vitest'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { adminPage } from '../apps/server/src/ui/admin-page.ts'
import { tick, json, deferred } from './helpers/comments.mjs'
function page(t, handler) {
  const requests = []
  const dom = new JSDOM(adminPage, {
    url: 'https://example.com/admin',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.fetch = async (url, init) => {
        requests.push({ url, init })
        return handler(url, init)
      }
      window.confirm = () => true
    },
  })
  t.onTestFinished(() => dom.window.close())
  return { dom, requests, doc: dom.window.document }
}
function login(doc) {
  doc.getElementById('token').value = 'test-admin'
  doc
    .getElementById('login')
    .dispatchEvent(new doc.defaultView.Event('submit', { cancelable: true }))
}
test('admin treats hostile content as text and keeps credential only in headers/memory', async t => {
  const { doc, requests, dom } = page(t, () =>
    json({
      comments: [
        {
          id: 'a',
          nick: '<img onerror=alert(1)>',
          content_md: '<script>bad</script>',
          page_path: '/article',
          moderation_status: 'published',
          author_id: 'visitor',
          author_status: 'active',
          root_id: null,
        },
      ],
      next: null,
    })
  )
  login(doc)
  await tick()
  assert.equal(doc.querySelector('#list img'), null)
  assert.equal(doc.querySelector('#list script'), null)
  assert.equal(requests[0].init.headers.Authorization, 'Bearer test-admin')
  assert.ok(!requests[0].url.includes('token'))
  assert.equal(dom.window.localStorage.length, 0)
  const button = [...doc.querySelectorAll('#list button')].find(
    b => b.textContent === '隐藏'
  )
  button.click()
  await tick()
  assert.equal(requests[1].init.method, 'PATCH')
  assert.deepEqual(JSON.parse(requests[1].init.body), { status: 'hidden' })
  doc.getElementById('logout').click()
  assert.equal(doc.getElementById('panel').hidden, true)
  assert.equal(doc.getElementById('list').children.length, 0)
})
test('late administrative responses cannot reopen a logged-out panel', async t => {
  const wait = deferred()
  const { doc } = page(t, () => wait.promise)
  login(doc)
  doc.getElementById('logout').click()
  wait.resolve(json({ comments: [], next: null }))
  await tick()
  assert.equal(doc.getElementById('panel').hidden, true)
})
