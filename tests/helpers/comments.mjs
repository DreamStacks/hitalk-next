import { setImmediate } from 'node:timers'

export const tick = async () => {
  for (let i = 0; i < 6; i++)
    await new Promise(resolve => setImmediate(resolve))
}
export const comment = (overrides = {}) => ({
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
export const list = (comments, page = 1, more = false) => ({
  comments,
  total: comments.length,
  page_info: { path: '/article', comment_count: comments.length },
  pagination: { page, page_size: 10, has_more: more },
})
export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
export function deferred() {
  let resolve
  const promise = new Promise(done => {
    resolve = done
  })
  return { promise, resolve }
}
