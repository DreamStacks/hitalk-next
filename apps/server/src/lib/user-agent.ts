import Bowser from 'bowser'
import type { Comment } from '@hitalk/shared'

export const MAX_UA_LENGTH = 2048

export function clientInfo(ua: string | null): Comment['client'] {
  if (!ua?.trim()) return undefined
  const { browser, os } = Bowser.parse(ua.slice(0, MAX_UA_LENGTH))
  const browserLabel = browser.name
    ? [browser.name, browser.version?.split('.')[0]].filter(Boolean).join(' ')
    : undefined
  const osLabel = os.name
    ? [os.name, os.name === 'Windows' ? os.versionName : os.version]
        .filter(Boolean)
        .join(' ')
    : undefined
  return browserLabel || osLabel
    ? { browser: browserLabel, os: osLabel }
    : undefined
}
