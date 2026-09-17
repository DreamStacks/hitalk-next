import type { Context } from 'hono'
import type { Bindings } from '../types'

/** Missing configuration always denies access. Tokens are accepted only in headers. */
export function isAdmin(c: Context<{ Bindings: Bindings }>): boolean {
  const expected = c.env.ADMIN_TOKEN
  const authorization = c.req.header('Authorization')
  return Boolean(expected?.trim() && authorization === `Bearer ${expected}`)
}
