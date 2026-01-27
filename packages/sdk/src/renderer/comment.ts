/**
 * 评论渲染器
 */

import type { Comment } from '@hitalk/shared'
import { getGravatarUrl, timeAgo, HtmlUtil, getLink } from '../utils'

/**
 * 渲染单条评论
 * @param comment - 评论数据
 * @param avatarType - 头像类型
 * @param onReply - 回复回调函数 (用于递归渲染子评论)
 * @param onLike - 点赞回调函数 (用于递归渲染子评论)
 */
export function renderComment(
  comment: Comment,
  avatarType: string,
  onReply: (id: string, nick: string) => void,
  onLike: (id: string) => void,
  isChild: boolean = false
): string {
  const avatar =
    avatarType === 'hide'
      ? ''
      : `<img class="vimg" src="${getGravatarUrl(comment.email || comment.nick, avatarType)}" alt="${comment.nick}" />`

  const isPinned = comment.is_pinned ? '<span class="vpin">置顶</span>' : ''

  // 只有非子评论(即根评论)才渲染子评论容器
  let childrenSection = ''
  if (!isChild && comment.children && comment.children.length > 0) {
    const childrenHtml = comment.children
      .map(child => renderComment(child, avatarType, onReply, onLike, true))
      .join('')
    childrenSection = `
      <div class="vchildren">
        <ul class="vlist">
          ${childrenHtml}
        </ul>
      </div>
    `
  }

  return `
    <li class="vcard" id="${comment.id}">
      ${avatar}
      <section>
        <div class="vhead">
          <a rel="nofollow" href="${getLink({ link: comment.website, mail: comment.email })}" target="_blank">
            ${HtmlUtil.encode(comment.nick)}
          </a>
          ${isPinned}
          <span class="vtime">${timeAgo(comment.created_at)}</span>
        </div>
        <div class="vcontent">${comment.content_html}</div>
        <div class="vfooter">
          <span class="vlike" data-id="${comment.id}">
            <i class="vlike-icon">❤</i>
            <span class="vlike-count">${comment.like_count || ''}</span>
          </span>
          <span class="vat" data-id="${comment.id}" data-nick="${comment.nick}">回复</span>
        </div>
        ${childrenSection}
      </section>
    </li>
  `
}

/**
 * 渲染评论列表
 */
export function renderCommentList(
  comments: Comment[],
  avatarType: string,
  onReply: (id: string, nick: string) => void,
  onLike: (id: string) => void
): string {
  if (comments.length === 0) {
    return '<div class="vempty">还没有评论哦，快来抢沙发吧!</div>'
  }

  return `
    <ul class="vlist">
      ${comments.map(comment => renderComment(comment, avatarType, onReply, onLike)).join('')}
    </ul>
  `
}
