import { normalizePagePath, type CommentCountResponse } from '@hitalk/shared'
import { HitalkAPI } from './api'

/** Count without mounting an editor. Keys are canonical paths; duplicates share one request. */
export async function getCommentCounts(
  server: string,
  paths: readonly string[]
): Promise<CommentCountResponse> {
  if (!server) throw new Error('Hitalk: 缺少 server 配置')
  const unique = [...new Set(paths.map(normalizePagePath))]
  const api = new HitalkAPI(server)
  const counts: CommentCountResponse = {}
  try {
    // Bound concurrency and respect the server's 50-path batch limit.
    for (let index = 0; index < unique.length; index += 50) {
      Object.assign(
        counts,
        await api.getCommentCounts(unique.slice(index, index + 50))
      )
    }
    return counts
  } finally {
    api.destroy()
  }
}

export interface CommentCountOptions {
  server: string
  /** Scan only this subtree, useful for SPA article lists. Defaults to document. */
  root?: ParentNode
}

/** Fill article counters explicitly, independently of comment mounting or page navigation. */
export async function fillCommentCounts({
  server,
  root = document,
}: CommentCountOptions): Promise<CommentCountResponse> {
  const targets = Array.from(
    root.querySelectorAll<HTMLElement>('.hitalk-comment-count[data-xid]'),
    element => {
      const attribute = element.getAttribute('data-xid')!
      return { element, attribute, path: normalizePagePath(attribute) }
    }
  )
  const counts = await getCommentCounts(
    server,
    targets.map(target => target.path)
  )
  for (const { element, attribute, path } of targets) {
    // A host may reuse a counter element for a different article while requests are pending.
    if (element.getAttribute('data-xid') === attribute)
      element.textContent = String(counts[path] ?? 0)
  }
  return counts
}
