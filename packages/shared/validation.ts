import * as v from 'valibot'
import type { CommentCreateRequest } from './types'

const requiredText = (name: string, max: number) =>
  v.pipe(
    v.string(`${name} 必须是字符串`),
    v.trim(),
    v.minLength(1, `${name} 不能为空`),
    v.maxLength(max, `${name} 过长`)
  )
const optionalText = (name: string, max: number) =>
  v.optional(
    v.pipe(
      v.string(`${name} 必须是字符串`),
      v.trim(),
      v.maxLength(max, `${name} 过长`),
      v.transform(value => value || undefined)
    )
  )
export const pagePathSchema = v.pipe(
  requiredText('path', 1024),
  v.check(
    path =>
      path.startsWith('/') && !path.startsWith('//') && !/[\s?#\\]/u.test(path),
    'path 必须是以 / 开头、不含查询参数或片段的页面路径'
  ),
  v.transform(path => path.replace(/\/index\.html?$/, '/'))
)
const emailSchema = v.pipe(requiredText('邮箱', 254), v.email('邮箱格式不正确'))
const websiteSchema = v.pipe(
  requiredText('网址', 2048),
  v.url('网址格式不正确'),
  v.check(value => {
    try {
      const url = new URL(value)
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password
      )
    } catch {
      return false
    }
  }, '网址只允许不含用户名和密码的 HTTP/HTTPS 地址')
)
const optionalValidText = <T extends v.GenericSchema<string, string>>(
  schema: T
) =>
  v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.union([
        v.pipe(
          v.literal(''),
          v.transform(() => undefined)
        ),
        schema,
      ])
    )
  )
export const commentCreateSchema: v.GenericSchema<
  unknown,
  CommentCreateRequest
> = v.object({
  path: pagePathSchema,
  nick: requiredText('昵称', 80),
  content: requiredText('评论', 20000),
  title: optionalText('title', 200),
  email: optionalValidText(emailSchema),
  website: optionalValidText(websiteSchema),
  reply_to_id: optionalText('reply_to_id', 128),
  client_request_id: v.pipe(v.string(), v.uuid('请求标识无效')),
  notify: v.optional(v.boolean()),
})
export const parseCommentInput = (value: unknown) =>
  v.safeParse(commentCreateSchema, value)
export const parsePagePath = (value: unknown) =>
  v.safeParse(pagePathSchema, value)
/** Shared by the API, SDK and import tooling; never silently discard query/fragment data. */
export function normalizePagePath(value: string): string {
  const result = parsePagePath(value)
  if (!result.success) throw new Error(result.issues[0].message)
  return result.output
}
export const isValidEmail = (value: string): boolean => v.is(emailSchema, value)
export const isValidWebsite = (value: string): boolean =>
  v.is(websiteSchema, value)
