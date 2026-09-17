const button = document.querySelector<HTMLButtonElement>('#theme-toggle')!
const events = new AbortController()

function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark'
  button.setAttribute('aria-label', dark ? '切换到浅色模式' : '切换到深色模式')
  button.setAttribute('aria-pressed', String(dark))
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#17231e' : '#f5f8f5')
}

updateThemeButton()
button.addEventListener(
  'click',
  () => {
    const theme =
      document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('hitalk-playground-theme', theme)
    } catch {
      // Theme switching also works when browser storage is unavailable.
    }
    updateThemeButton()
  },
  { signal: events.signal }
)

if (import.meta.hot) {
  import.meta.hot.accept()
  import.meta.hot.dispose(() => events.abort())
}
