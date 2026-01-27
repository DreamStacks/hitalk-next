/**
 * 评论事件绑定
 */

import { Event } from '../utils'

/**
 * 绑定评论列表事件
 */
export function bindCommentEvents(
  container: HTMLElement,
  onReply: (id: string, nick: string) => void,
  onLike: (id: string) => void
) {
  // 回复按钮
  container.querySelectorAll('.vat').forEach(el => {
    Event.on('click', el as HTMLElement, () => {
      const id = el.getAttribute('data-id')!
      const nick = el.getAttribute('data-nick')!
      onReply(id, nick)
    })
  })

  // 点赞按钮
  container.querySelectorAll('.vlike').forEach(el => {
    Event.on('click', el as HTMLElement, () => {
      const id = el.getAttribute('data-id')!
      onLike(id)
    })
  })

  // 展开长评论
  container.querySelectorAll('.vcontent').forEach(el => {
    const content = el as HTMLElement
    if (content.offsetHeight > 180) {
      content.classList.add('expand')
      Event.on('click', content, () => {
        content.classList.remove('expand')
      })
    }
  })
}
