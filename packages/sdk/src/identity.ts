/** One anonymous credential per host origin and API base, shared across widgets/tabs. */
export class VisitorIdentity {
  readonly key: string
  constructor(server: string) {
    this.key = `hitalk:identity:${server}`
  }
  read(): string | null {
    try {
      const token = localStorage.getItem(this.key)
      return token && /^ht_[A-Za-z0-9_-]{43}$/.test(token) ? token : null
    } catch {
      return null
    }
  }
  async ensure(): Promise<string> {
    return navigator.locks.request(this.key, () => {
      const existing = this.read()
      if (existing) return existing
      const bytes = crypto.getRandomValues(new Uint8Array(32))
      const token =
        'ht_' +
        btoa(String.fromCharCode(...bytes))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '')
      try {
        localStorage.setItem(this.key, token)
        if (localStorage.getItem(this.key) !== token) throw new Error('storage')
      } catch {
        throw new Error('浏览器无法保存身份，请允许站点存储后重试')
      }
      return token
    })
  }
}
