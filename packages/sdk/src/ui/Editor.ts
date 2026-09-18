import { html, nothing, render } from 'lit-html'
import type { GuestField, UserInfo } from '@hitalk/shared'
import { isValidEmail, isValidWebsite } from '@hitalk/shared'
import { renderEmojiPicker } from '../renderer/emoji'
import { sendMotion } from './motion'
export interface EditorData extends UserInfo {
  content: string
  notify: boolean
}
export class Editor {
  private events = new AbortController()
  private submitting = false
  private replyNick: string | null = null
  private emojiOpen = false
  private emojiCategory = 0
  private editingProfile = true
  constructor(
    private container: HTMLElement,
    private userInfo: UserInfo | null,
    private placeholder: string,
    private onSubmit: (data: EditorData) => void,
    private onCancel: () => void,
    private guestFields: readonly GuestField[],
    private onProfileChange: (info: UserInfo) => void
  ) {
    this.editingProfile = !this.validProfile(userInfo)
    this.render()
    container.ownerDocument.body.addEventListener(
      'mouseup',
      event => {
        if (
          this.emojiOpen &&
          !this.container
            .querySelector('.vemoji')
            ?.contains(event.target as Node)
        ) {
          this.emojiOpen = false
          this.render()
        }
      },
      { signal: this.events.signal }
    )
  }
  snapshot(): EditorData {
    const value = (selector: string) =>
      this.container.querySelector<HTMLInputElement>(selector)?.value || ''
    return {
      nick: value('.vnick'),
      email: value('.vmail'),
      website: value('.vlink'),
      content: value('.veditor'),
      notify:
        this.container.querySelector<HTMLInputElement>('.vnotify')?.checked ||
        false,
    }
  }
  restore(data: Partial<EditorData>) {
    for (const [name, selector] of Object.entries({
      nick: '.vnick',
      email: '.vmail',
      website: '.vlink',
      content: '.veditor',
    })) {
      const el = this.container.querySelector<HTMLInputElement>(selector)
      const value = data[name as keyof EditorData]
      if (el && typeof value === 'string') el.value = value
    }
    const notify = this.container.querySelector<HTMLInputElement>('.vnotify')
    if (notify) notify.checked = data.notify === true
    // Unsaved profile edits in a restored draft must remain visible.
    const current = this.snapshot()
    if (
      this.guestFields.some(
        field => current[field].trim() !== (this.userInfo?.[field] || '').trim()
      )
    ) {
      this.editingProfile = true
      this.render()
    }
  }
  private validProfile(info: UserInfo | null): boolean {
    return Boolean(
      this.guestFields.includes('nick') &&
      info?.nick.trim() &&
      info.nick.trim().length <= 80 &&
      (!this.guestFields.includes('email') ||
        !info.email.trim() ||
        isValidEmail(info.email.trim())) &&
      (!this.guestFields.includes('website') ||
        !info.website.trim() ||
        isValidWebsite(info.website.trim()))
    )
  }
  saveProfile(info: UserInfo) {
    this.userInfo = {
      nick: info.nick.trim(),
      email: info.email.trim(),
      website: info.website.trim(),
    }
    this.editingProfile = !this.validProfile(this.userInfo)
    this.render()
    this.onProfileChange(this.userInfo)
  }
  private finishProfile() {
    if (this.submitting || !this.editingProfile) return
    const data = this.snapshot()
    if (this.validProfile(data)) this.saveProfile(data)
  }
  private render() {
    render(
      html`<div class="vwrap">
        <div class="vprofile" ?hidden=${this.editingProfile}>
          <span class="vprofile-nick">${this.userInfo?.nick}</span>
          <button
            class="vprofile-edit"
            type="button"
            aria-label="编辑个人信息"
            ?disabled=${this.submitting}
            @click=${() => {
              this.editingProfile = true
              this.render()
              this.container.querySelector<HTMLInputElement>('.vnick')?.focus()
            }}
          >
            编辑
          </button>
        </div>
        <div class="vheader" ?hidden=${!this.editingProfile}>
          ${this.guestFields.map(field => html`<input name=${field} type=${field === 'email' ? 'email' : field === 'website' ? 'url' : 'text'} class=${`vinput ${field === 'nick' ? 'vnick' : field === 'email' ? 'vmail' : 'vlink'}`} aria-label=${field === 'nick' ? '昵称' : field === 'email' ? '邮箱' : '网址'} placeholder=${field === 'nick' ? '昵称' : field === 'email' ? '邮箱（可选）' : '网址（可选）'} .value=${this.userInfo?.[field] || ''} ?disabled=${this.submitting} />`)}
        </div>
        ${this.replyNick ? html`<div class="vreplying">回复 @${this.replyNick} <button type="button" ?disabled=${this.submitting} @click=${this.onCancel}>取消回复</button></div>` : nothing}
        <textarea
          class="vinput veditor"
          name="content"
          aria-label="评论内容"
          placeholder=${this.placeholder}
          .readOnly=${this.submitting}
          @focus=${() => this.finishProfile()}
        ></textarea>
        <div class="vcontrol">
          <div class="vemoji">
            <button
              type="button"
              aria-label="插入表情"
              aria-expanded=${String(this.emojiOpen)}
              ?disabled=${this.submitting}
              @click=${() => {
                this.emojiOpen = !this.emojiOpen
                this.render()
              }}
            >
              😊</button
            >${
              this.emojiOpen
                ? renderEmojiPicker(
                    this.emojiCategory,
                    category => {
                      this.emojiCategory = category
                      this.render()
                    },
                    value => {
                      const input =
                        this.container.querySelector<HTMLTextAreaElement>(
                          '.veditor'
                        )!
                      input.value += ` ${value} `
                      input.focus()
                      this.emojiOpen = false
                      this.render()
                    }
                  )
                : nothing
            }
          </div>
          ${this.guestFields.includes('email') ? html`<label><input type="checkbox" name="notify" class="vnotify" ?disabled=${this.submitting} />有回复时邮件通知</label>` : nothing}
          <button
            class="vbtn vsubmit"
            type="button"
            ?disabled=${this.submitting}
            @click=${() => {
              if (!this.submitting) this.onSubmit(this.snapshot())
            }}
          >
            <svg
              class="hitalk-send-plane"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m21 3-7 18-4-7-7-4 18-7Zm0 0L10 14" />
            </svg>
            ${this.submitting ? '发送中…' : '发送'}
          </button>
        </div>
      </div>`,
      this.container
    )
  }
  setReply(nick: string | null) {
    this.replyNick = nick
    this.render()
  }
  focus() {
    this.container
      .querySelector<HTMLTextAreaElement>('.veditor')
      ?.focus({ preventScroll: true })
  }
  setSubmitting(value: boolean) {
    this.submitting = value
    this.render()
  }
  clear() {
    this.container.querySelector<HTMLTextAreaElement>('.veditor')!.value = ''
  }
  celebrate() {
    sendMotion(this.container)
  }
  destroy() {
    this.events.abort()
    render(nothing, this.container).setConnected(false)
    this.container.remove()
  }
}
