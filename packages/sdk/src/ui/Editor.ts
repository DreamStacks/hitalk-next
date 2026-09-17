import { html, nothing, render } from 'lit-html'
import { createRef, ref } from 'lit-html/directives/ref.js'
import type { UserInfo } from '@hitalk/shared'
import { renderEmojiPicker } from '../renderer/emoji'

export interface EditorData extends UserInfo {
  content: string
}

export class Editor {
  private events = new AbortController()
  private textarea = createRef<HTMLTextAreaElement>()
  private smiles = createRef<HTMLElement>()
  private submitting = false
  private replyNick: string | null = null
  private emojiOpen = false
  private emojiCategory = 0
  private editingInfo: boolean

  constructor(
    private container: HTMLElement,
    private userInfo: UserInfo | null,
    private placeholder: string,
    private onSubmit: (data: EditorData) => void,
    private onCancel: () => void
  ) {
    this.editingInfo = !userInfo
    this.render()
    container.ownerDocument.body.addEventListener(
      'mouseup',
      event => {
        if (
          this.emojiOpen &&
          !this.smiles.value?.contains(event.target as Node)
        ) {
          this.emojiOpen = false
          this.render()
        }
      },
      { signal: this.events.signal }
    )
  }

  private submit = () => {
    if (this.submitting) return
    const value = (selector: string) =>
      this.container.querySelector<HTMLInputElement>(selector)!.value.trim()
    this.onSubmit({
      nick: value('.vnick'),
      email: value('.vmail'),
      website: value('.vlink'),
      content: this.textarea.value!.value.trim(),
    })
  }

  private selectEmoji = (value: string) => {
    if (this.submitting) return
    this.textarea.value!.value += ` ${value} `
    this.textarea.value!.focus()
    this.emojiOpen = false
    this.render()
  }

  private selectCategory = (index: number) => {
    this.emojiCategory = index
    this.render()
  }

  private render() {
    render(
      html`
        <div class="vwrap">
          ${
            this.userInfo
              ? html`<div class="welcome">
                  欢迎回来,${this.userInfo.nick}!<span
                    class="info-edit"
                    @click=${() => {
                      this.editingInfo = !this.editingInfo
                      this.render()
                    }}
                    >修改</span
                  >
                </div>`
              : nothing
          }
          <div class="vheader${this.editingInfo ? '' : ' hide'}">
            <input
              name="nick"
              placeholder="称呼"
              class="vnick vinput"
              type="text"
              .value=${this.userInfo?.nick || ''}
              ?disabled=${this.submitting}
            />
            <input
              name="email"
              placeholder="邮箱"
              class="vmail vinput"
              type="email"
              .value=${this.userInfo?.email || ''}
              ?disabled=${this.submitting}
            />
            <input
              name="website"
              placeholder="网址"
              class="vlink vinput"
              type="text"
              .value=${this.userInfo?.website || ''}
              ?disabled=${this.submitting}
            />
          </div>
          <!-- Native input values remain user-owned between renders; only clear() resets the draft. -->
          <div class="vedit">
            <textarea
              ${ref(this.textarea)}
              class="veditor vinput"
              placeholder=${this.replyNick === null ? this.placeholder : `回复 @${this.replyNick}`}
              ?disabled=${this.submitting}
            ></textarea>
          </div>
          <div class="vcontrol">
            <span
              ${ref(this.smiles)}
              class="smiles${this.emojiOpen ? ' smiles-open' : ''}"
            >
              <div
                class="smiles-logo"
                @click=${() => {
                  if (!this.submitting) {
                    this.emojiOpen = !this.emojiOpen
                    this.render()
                  }
                }}
              >
                <span>😊</span>
              </div>
              ${renderEmojiPicker(this.emojiCategory, this.selectCategory, this.selectEmoji)}
            </span>
            <div class="vactions">
              <button
                type="button"
                class="vcancel-reply vbtn${this.replyNick === null ? ' dn' : ''}"
                ?disabled=${this.submitting}
                @click=${this.onCancel}
              >
                取消
              </button>
              <button
                type="button"
                class="vsubmit vbtn"
                ?disabled=${this.submitting}
                @click=${this.submit}
              >
                回复
              </button>
            </div>
          </div>
        </div>
      `,
      this.container
    )
  }

  setReply(nick: string | null) {
    this.replyNick = nick
    this.render()
  }

  focus() {
    this.textarea.value?.focus({ preventScroll: true })
  }

  setSubmitting(submitting: boolean) {
    this.submitting = submitting
    if (submitting) this.emojiOpen = false
    this.render()
  }

  clear() {
    this.textarea.value!.value = ''
  }

  destroy() {
    this.events.abort()
    render(nothing, this.container).setConnected(false)
    this.container.remove()
  }
}
