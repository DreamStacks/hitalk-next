import { fail } from './errors'
interface Cursor {
  scope: string
  snapshot: number
  after: number
}
export function encodeCursor(value: Cursor): string {
  return btoa(JSON.stringify(value))
}
export function decodeCursor(
  value: string | undefined,
  scope: string
): Cursor | null {
  if (!value) return null
  try {
    if (value.length > 4096) throw new Error('length')
    const result: unknown = JSON.parse(atob(value))
    if (!result || typeof result !== 'object') throw new Error('shape')
    const c = result as Cursor
    if (
      c.scope !== scope ||
      !Number.isSafeInteger(c.snapshot) ||
      c.snapshot < 0 ||
      !Number.isSafeInteger(c.after) ||
      c.after < 0 ||
      c.after > c.snapshot
    )
      throw new Error('scope')
    return c
  } catch {
    fail(400, 'INVALID_CURSOR', '分页游标无效')
  }
}
