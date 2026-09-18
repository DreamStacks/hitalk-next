import { html } from 'lit-html'

const feedback = {
  info: { title: '提示', path: 'M12 11v6M12 7h.01' },
  loading: { title: '发送中', path: 'M12 3a9 9 0 0 1 9 9' },
  success: { title: '操作成功', path: 'm7 12 3 3 7-7' },
  warning: { title: '请留意', path: 'M12 7v6M12 17h.01' },
  error: { title: '操作未完成', path: 'm8 8 8 8M16 8l-8 8' },
} as const
export type FeedbackKind = keyof typeof feedback

export function renderFeedback(message: string, kind: FeedbackKind) {
  const { title, path } = feedback[kind]
  return html`<div
    class="hitalk-feedback"
    data-visible=${Boolean(message)}
    data-kind=${kind}
  >
    <svg
      class="hitalk-feedback-icon"
      ?hidden=${!message}
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="9"></circle>
      <path d=${path}></path>
    </svg>
    <div
      class="hitalk-status"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <strong class="hitalk-feedback-title" ?hidden=${!message}
        >${title}</strong
      >
      <span class="hitalk-feedback-message">${message}</span>
    </div>
  </div>`
}
