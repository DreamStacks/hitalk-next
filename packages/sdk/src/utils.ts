/**
 * 获取链接
 */
export function getLink(link?: string): string {
  try {
    const url = new URL(link || '')
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return url.href
  } catch {
    /* Missing or invalid links render without navigation. */
  }
  return '#'
}

/**
 * 时间格式化
 */
export function timeAgo(date: Date | string): string {
  const now = new Date()
  const past = new Date(date)
  const diff = now.getTime() - past.getTime()

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 7) {
    return dateFormat(past)
  }
  if (days > 0) return `${days} 天前`
  if (hours > 0) return `${hours} 小时前`
  if (minutes > 0) return `${minutes} 分钟前`
  return '刚刚'
}

/**
 * 日期格式化
 */
export function dateFormat(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 获取 Gravatar URL
 */
export function getGravatarUrl(hash: string, avatar: string = 'mm'): string {
  const safeHash = /^[a-f0-9]{32}$/.test(hash) ? hash : ''
  return `https://gravatar.loli.net/avatar/${safeHash}?s=40&d=${encodeURIComponent(avatar)}`
}
