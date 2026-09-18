import { fail } from './errors'
import {
  parseCommentInput,
  parsePagePath,
  type CommentCreateRequest,
} from '@hitalk/shared'

export function badRequest(message: string): never {
  fail(400, 'INVALID_INPUT', message)
}

export function pagePath(value: unknown): string {
  const result = parsePagePath(value)
  if (!result.success) badRequest(result.issues[0].message)
  return result.output
}

export function commentInput(value: unknown): CommentCreateRequest {
  const result = parseCommentInput(value)
  if (!result.success) badRequest(result.issues[0].message)
  return result.output
}

export function positiveInteger(
  value: string | undefined,
  fallback: number,
  max: number
): number {
  if (value === undefined) return fallback
  const number = Number(value)
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > max
  )
    badRequest('分页参数不合法')
  return number
}
