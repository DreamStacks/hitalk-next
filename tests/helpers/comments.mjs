import { setImmediate } from 'node:timers'

export const tick = async () => {
  for (let i = 0; i < 6; i++)
    await new Promise(resolve => setImmediate(resolve))
}
export const comment = (overrides = {}) => ({
  id: '123-nanoid',
  sequence: 1,
  root_id: null,
  reply_to: null,
  deleted: false,
  status: 'published',
  liked: false,
  can_reply: true,
  can_delete: false,
  nick: 'Reader',
  avatar_hash: 'a'.repeat(32),
  content_html: '<p>hello</p>',
  like_count: 0,
  is_admin: false,
  is_pinned: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  replies: [],
  reply_count: 0,
  reply_cursor: null,
  ...overrides,
})
export const list = (comments, cursor = null) => ({
  comments,
  pinned: [],
  total: comments.length,
  next_cursor: cursor,
  comments_enabled: true,
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
