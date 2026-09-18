import { html, nothing, type TemplateResult } from 'lit-html'
import { repeat } from 'lit-html/directives/repeat.js'
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js'
import type { Comment } from '@hitalk/shared'
import { getGravatarUrl, getLink, timeAgo } from '../utils'
export interface CommentActions {
  onReply: (id: string, nick: string) => void
  onLike: (id: string) => void
  onLocate: (id: string) => void
  onDelete: (id: string) => void
  onMore: (id: string) => void
  isLoading: (id: string) => boolean
}
function renderComment(
  c: Comment,
  avatar: string,
  actions: CommentActions,
  child = false
): TemplateResult {
  return html`<li class="vcard" id=${c.id} tabindex="-1">
    ${avatar === 'hide' || c.deleted ? nothing : html`<img class="vimg" src=${getGravatarUrl(c.avatar_hash, avatar)} alt=${c.nick} />`}
    <section>
      <div class="vhead">
        <a
          href=${getLink(c.website)}
          rel="nofollow noopener noreferrer"
          target="_blank"
          >${c.nick}</a
        >${c.is_pinned ? html`<span class="vpin">置顶</span>` : nothing}${c.is_admin ? html`<span class="vbadge">博主</span>` : nothing}<span
          class="vtime"
          >${timeAgo(c.created_at)}</span
        >${c.client ? html`<span class="vua">${[c.client.browser, c.client.os].filter(Boolean).join(' · ')}</span>` : nothing}
      </div>
      ${c.reply_to ? html`<button class="vreply-to" type="button" ?disabled=${!c.reply_to.available} @click=${() => actions.onLocate(c.reply_to!.id)}>回复 @${c.reply_to.nick}</button>` : nothing}
      <div
        class="vcontent"
        @click=${(e: Event) => (e.currentTarget as HTMLElement).classList.remove('expand')}
      >
        ${c.deleted ? '该评论已删除' : unsafeHTML(c.content_html)}
      </div>
      ${c.status !== 'published' && !c.deleted ? html`<div class="hitalk-comment-status">${c.status === 'pending' ? '审核中' : '该评论未公开'}</div>` : nothing}
      <div class="vmeta">
        ${!c.deleted && c.status === 'published' ? html`<button class="vlike" type="button" aria-pressed=${String(c.liked)} aria-label=${`${c.liked ? '取消点赞' : '点赞'}，${c.like_count} 个赞`} @click=${() => actions.onLike(c.id)}><span class="vlike-symbol" aria-hidden="true">${c.liked ? '♥' : '♡'}</span> <span class="vlike-count">${c.like_count}</span><span class="hitalk-like-spark" aria-hidden="true">♥</span><span class="hitalk-like-spark" aria-hidden="true">♥</span><span class="hitalk-like-spark" aria-hidden="true">♥</span></button>` : nothing}${c.can_reply ? html`<button class="vat" type="button" @click=${() => actions.onReply(c.id, c.nick)}>回复</button>` : nothing}${c.can_delete ? html`<button class="vdelete" type="button" @click=${() => actions.onDelete(c.id)}>删除</button>` : nothing}
      </div>
      <div class="hitalk-reply-slot"></div>
      ${
        !child
          ? html`<ul class="vquote">
                ${repeat(
                  c.replies || [],
                  r => r.id,
                  r => renderComment(r, avatar, actions, true)
                )}
              </ul>
              ${c.reply_cursor ? html`<button class="vbtn vmore-replies" ?disabled=${actions.isLoading(c.id)} @click=${() => actions.onMore(c.id)}>${actions.isLoading(c.id) ? '正在加载…' : `查看更多回复（${c.reply_count || 0}）`}</button>` : nothing}`
          : nothing
      }
    </section>
  </li>`
}
export function renderCommentList(
  comments: Comment[],
  avatar: string,
  actions: CommentActions
): TemplateResult {
  return comments.length
    ? html`<ul class="vlist">
        ${repeat(
          comments,
          c => c.id,
          c => renderComment(c, avatar, actions)
        )}
      </ul>`
    : html`<div class="vempty">还没有评论哦，快来抢沙发吧！</div>`
}
