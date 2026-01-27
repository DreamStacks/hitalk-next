/**
 * Editor 组件 - 评论输入框
 */

import type { UserInfo } from '@hitalk/shared'
import { HtmlUtil } from '../utils'
import { renderEmojiPicker } from '../renderer'

export class Editor {
  private container: HTMLElement
  private onSubmit: (data: {
    nick: string
    email: string
    website: string
    content: string
  }) => void

  constructor(
    container: HTMLElement,
    userInfo: UserInfo | null,
    placeholder: string,
    onSubmit: (data: any) => void,
    onCancel: () => void
  ) {
    this.container = container
    this.onSubmit = onSubmit
    this.render(userInfo, placeholder, onCancel)
  }

  private render(
    userInfo: UserInfo | null,
    placeholder: string,
    onCancel: () => void
  ) {
    const welcomeSection = userInfo
      ? `
      <div class="welcome">
        欢迎回来,${HtmlUtil.encode(userInfo.nick)}!
        <span class="info-edit">修改</span>
      </div>
    `
      : ''

    const headerClass = userInfo ? 'vheader hide' : 'vheader'

    this.container.innerHTML = `
      <div class="vwrap">
        ${welcomeSection}
        <div class="${headerClass}">
          <input name="nick" placeholder="称呼" class="vnick vinput" type="text" value="${userInfo?.nick || ''}" />
          <input name="email" placeholder="邮箱" class="vmail vinput" type="email" value="${userInfo?.email || ''}" />
          <input name="website" placeholder="网址" class="vlink vinput" type="text" value="${userInfo?.website || ''}" />
        </div>
        <div class="vedit">
          <textarea class="veditor vinput" placeholder="${placeholder}"></textarea>
        </div>
        <div class="vcontrol">
          <span class="smiles">
            <div class="smiles-logo"><span>😊</span></div>
            ${renderEmojiPicker()}
          </span>
          <div class="vactions">
            <button type="button" class="vcancel-reply vbtn dn">取消</button>
            <button type="button" class="vsubmit vbtn">回复</button>
          </div>
        </div>
      </div>
    `

    this.bindEvents(onCancel)
  }

  private bindEvents(onCancel: () => void) {
    // 获取元素
    const submitBtn = this.container.querySelector(
      '.vsubmit'
    ) as HTMLButtonElement
    const cancelBtn = this.container.querySelector(
      '.vcancel-reply'
    ) as HTMLButtonElement
    const editor = this.container.querySelector(
      '.veditor'
    ) as HTMLTextAreaElement
    const infoEdit = this.container.querySelector('.info-edit')
    const header = this.container.querySelector('.vheader')

    // 提交按钮
    submitBtn?.addEventListener('click', () => {
      const nick = (
        this.container.querySelector('.vnick') as HTMLInputElement
      )?.value.trim()
      const email = (
        this.container.querySelector('.vmail') as HTMLInputElement
      )?.value.trim()
      const website = (
        this.container.querySelector('.vlink') as HTMLInputElement
      )?.value.trim()
      const content = editor?.value.trim()

      this.onSubmit({ nick, email, website, content })
    })

    // 取消按钮
    cancelBtn?.addEventListener('click', () => {
      onCancel()
    })

    // 表情选择 - 使用独立的事件绑定模块
    this.bindEmojiSelection(editor)

    // 用户信息编辑切换
    if (infoEdit && header) {
      infoEdit.addEventListener('click', () => {
        header.classList.toggle('hide')
      })
    }
  }

  /**
   * 绑定表情选择事件
   */
  private bindEmojiSelection(editor: HTMLTextAreaElement) {
    if (!editor) return

    const smiles = this.container.querySelector('.smiles')
    if (!smiles) return

    // 表情选择
    smiles.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement

      // 选择表情
      if (
        target.classList.contains('smiles-item') ||
        target.parentElement?.classList.contains('smiles-item')
      ) {
        const item = target.classList.contains('smiles-item')
          ? target
          : target.parentElement
        const emojiInput = item?.getAttribute('data-input')
        if (emojiInput) {
          editor.value += ` ${emojiInput} `
          editor.focus()
          smiles.classList.remove('smiles-open')
        }
      }
      // 切换面板
      else if (
        target.classList.contains('smiles-logo') ||
        target.closest('.smiles-logo')
      ) {
        smiles.classList.toggle('smiles-open')
      }
      // 切换表情包
      else if (
        target.classList.contains('smiles-name') ||
        target.closest('.smiles-name')
      ) {
        const nameEl = target.closest('.smiles-name') as HTMLElement
        if (nameEl && !nameEl.classList.contains('smiles-package-active')) {
          this.container
            .querySelectorAll('.smiles-name')
            .forEach(el => el.classList.remove('smiles-package-active'))
          this.container
            .querySelectorAll('.smiles-items')
            .forEach(el => el.classList.remove('smiles-items-show'))

          const id = nameEl.getAttribute('data-id')
          const items = this.container.querySelector(
            `.smiles-items[data-id="${id}"]`
          )
          if (items) {
            items.classList.add('smiles-items-show')
            nameEl.classList.add('smiles-package-active')
          }
        }
      }
    })

    // 点击外部关闭
    document.body.addEventListener('mouseup', (e: Event) => {
      const target = e.target as HTMLElement
      if (!smiles.contains(target)) {
        smiles.classList.remove('smiles-open')
      }
    })
  }

  clear() {
    const editor = this.container.querySelector(
      '.veditor'
    ) as HTMLTextAreaElement
    if (editor) editor.value = ''
  }
}
