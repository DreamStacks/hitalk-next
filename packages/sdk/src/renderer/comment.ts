import { html, nothing, type TemplateResult } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js'
import type { Comment } from '@hitalk/shared'
import { getGravatarUrl, timeAgo, getLink } from '../utils'

export interface CommentActions {
  onReply: (id: string, nick: string) => void
  onLike: (id: string) => void
  onLocate: (id: string) => void
}

function expandContent(event: Event) {
  const content = event.currentTarget as HTMLElement
  content.classList.remove('expand')
}

export function renderComment(
  comment: Comment,
  avatarType: string,
  actions: CommentActions,
  commentsById: ReadonlyMap<string, Comment>,
  isChild = false
): TemplateResult {
  const parent = comment.parent_id
    ? commentsById.get(comment.parent_id)
    : undefined
  return html`
    <li class="vcard" id=${comment.id} tabindex="-1">
      ${avatarType === 'hide' ? nothing : html`<img class="vimg" src=${getGravatarUrl(comment.avatar_hash, avatarType)} alt=${comment.nick} />`}
      <section>
        <div class="vhead">
          <a
            rel="nofollow noopener noreferrer"
            href=${getLink(comment.website)}
            target="_blank"
            >${comment.nick}</a
          >
          ${comment.is_pinned ? html`<span class="vpin">置顶</span>` : nothing}
          <span class="vtime">${timeAgo(comment.created_at)}</span>
          ${
            comment.client?.browser || comment.client?.os
              ? html`<span class="vua" aria-label="浏览器与操作系统"
                  >${[comment.client.browser, comment.client.os].filter(Boolean).join(' · ')}</span
                >`
              : nothing
          }
        </div>
        ${
          parent
            ? html`<a
                class="vreply-to"
                href=${`#${encodeURIComponent(parent.id)}`}
                @click=${(event: MouseEvent) => {
                  event.preventDefault()
                  actions.onLocate(parent.id)
                }}
                >回复 @${parent.nick}</a
              >`
            : nothing
        }
        <!-- Only the trusted Hitalk server's sanitized Markdown may enter this HTML boundary. -->
        <div class="vcontent" @click=${expandContent}>
          ${unsafeHTML(comment.content_html)}
        </div>
        <div class="vfooter">
          <span
            class="vlike"
            data-id=${comment.id}
            @click=${() => actions.onLike(comment.id)}
          >
            <i class="vlike-icon">❤</i
            ><span class="vlike-count">${comment.like_count || ''}</span>
          </span>
          <span
            class="vat"
            data-id=${comment.id}
            data-nick=${comment.nick}
            @click=${() => actions.onReply(comment.id, comment.nick)}
            >回复</span
          >
        </div>
        ${
          !isChild && comment.children?.length
            ? html`
                <div class="vchildren">
                  <ul class="vlist">
                    ${repeat(
                      comment.children,
                      child => child.id,
                      child =>
                        renderComment(
                          child,
                          avatarType,
                          actions,
                          commentsById,
                          true
                        )
                    )}
                  </ul>
                </div>
              `
            : nothing
        }
        <!-- The editor owns this slot's contents; list rendering never writes into it. -->
        <div class="hitalk-reply-slot"></div>
      </section>
    </li>
  `
}

export function renderCommentList(
  comments: Comment[],
  avatarType: string,
  actions: CommentActions
): TemplateResult {
  const commentsById = new Map<string, Comment>()
  const collect = (items: Comment[]) => {
    for (const comment of items) {
      commentsById.set(comment.id, comment)
      if (comment.children) collect(comment.children)
    }
  }
  collect(comments)
  return comments.length
    ? html`<ul class="vlist">
        ${repeat(
          comments,
          comment => comment.id,
          comment => renderComment(comment, avatarType, actions, commentsById)
        )}
      </ul>`
    : html`<div class="vempty">还没有评论哦，快来抢沙发吧!</div>`
}
