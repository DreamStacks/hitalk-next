import type { Context } from 'hono'
import type { Bindings, Identity } from '../types'
import { fail } from './errors'
export async function digest(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    ),
    b => b.toString(16).padStart(2, '0')
  ).join('')
}
export function isAdmin(c: Context<{ Bindings: Bindings }>): boolean {
  return Boolean(
    c.env.ADMIN_TOKEN?.trim() &&
    c.req.header('Authorization') === `Bearer ${c.env.ADMIN_TOKEN}`
  )
}
export function requireAdmin(c: Context<{ Bindings: Bindings }>) {
  if (!isAdmin(c)) fail(401, 'ADMIN_REQUIRED', '管理权限验证失败')
}
export async function credential(
  c: Context<{ Bindings: Bindings }>,
  required = false
): Promise<string | null> {
  const value = c.req.header('Authorization')
  if (!value && !required) return null
  if (!value || !/^Bearer ht_[A-Za-z0-9_-]{43}$/.test(value))
    fail(401, 'IDENTITY_REQUIRED', '需要有效的匿名身份凭证')
  return digest(value.slice(7))
}
export async function identity(
  db: D1Database,
  hash: string | null
): Promise<Identity | null> {
  return hash
    ? db
        .prepare('SELECT id,status,kind FROM identities WHERE token_hash=?')
        .bind(hash)
        .first<Identity>()
    : null
}
export function requireActive(actor: Identity | null) {
  if (actor?.status === 'blocked')
    fail(403, 'IDENTITY_BLOCKED', '此身份已被停用')
}
export function identityInsert(db: D1Database, hash: string) {
  return db
    .prepare(
      'INSERT INTO identities(id,token_hash) VALUES(?,?) ON CONFLICT(token_hash) DO NOTHING'
    )
    .bind(crypto.randomUUID(), hash)
}
export async function limitWrite(
  c: Context<{ Bindings: Bindings }>,
  hash: string | null
) {
  if (c.env.RATE_LIMIT_ENABLED === 'false') return
  if (!c.env.WRITE_LIMITER || !c.env.IP_HASH_SALT)
    fail(503, 'RATE_LIMIT_UNCONFIGURED', '写入防护尚未配置')
  const ip = c.req.header('cf-connecting-ip') || 'local'
  const key = await digest(`${c.env.IP_HASH_SALT}:${ip}`)
  for (const candidate of [
    `ip:${key}`,
    ...(hash ? [`identity:${hash}`] : []),
  ]) {
    if (!(await c.env.WRITE_LIMITER.limit({ key: candidate })).success) {
      c.header('Retry-After', '60')
      fail(429, 'RATE_LIMITED', '操作过于频繁，请稍后重试')
    }
  }
}
