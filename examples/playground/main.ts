import { mount } from '../../packages/sdk/src/index'
import './playground.css'
import './theme'

const container = document.querySelector<HTMLElement>('#comment')!
const instance = mount(container, {
  server: import.meta.env.VITE_API_URL?.trim() || '/api',
  path: import.meta.env.VITE_PAGE_PATH?.trim() || '/playground',
  title: 'Hitalk 开发示例',
  placeholder: '来都来了，留个爪印吧～',
  avatar: 'mm',
  pageSize: 10,
})

// Keep unsent fields in memory across SDK hot updates, outside the published SDK.
const fields = ['.vnick', '.vmail', '.vlink', '.veditor'] as const
type Draft = Partial<Record<(typeof fields)[number], string>>
if (import.meta.hot) {
  const hot = import.meta.hot
  import.meta.hot.accept()
  const draft = hot.data.draft as Draft | undefined
  for (const selector of fields) {
    const input = container.querySelector<
      HTMLInputElement | HTMLTextAreaElement
    >(selector)
    if (input && draft?.[selector] !== undefined) input.value = draft[selector]
  }
  hot.dispose(data => {
    data.draft = Object.fromEntries(
      fields.map(selector => [
        selector,
        container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          selector
        )?.value || '',
      ])
    )
    instance.destroy()
  })
}
