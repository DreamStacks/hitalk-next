/**
 * 表情事件绑定
 */

import { Event } from '../utils'

/**
 * 绑定表情选择器事件
 */
export function bindEmojiEvents(
  container: HTMLElement,
  onSelect: (emoji: string) => void
) {
  const smiles = container.querySelector('.smiles')
  if (!smiles) return

  Event.on('click', smiles as HTMLElement, e => {
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
        onSelect(emojiInput)
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
        container
          .querySelectorAll('.smiles-name')
          .forEach(el => el.classList.remove('smiles-package-active'))
        container
          .querySelectorAll('.smiles-items')
          .forEach(el => el.classList.remove('smiles-items-show'))

        const id = nameEl.getAttribute('data-id')
        const items = container.querySelector(`.smiles-items[data-id="${id}"]`)
        if (items) {
          items.classList.add('smiles-items-show')
          nameEl.classList.add('smiles-package-active')
        }
      }
    }
  })

  // 点击外部关闭
  Event.on('mouseup', document.body, e => {
    const target = e.target as HTMLElement
    if (!smiles.contains(target)) {
      smiles.classList.remove('smiles-open')
    }
  })
}
