import type { CommentRow, Page } from '../types'
import { renderMarkdown } from '../lib/markdown'

type MailComment = Pick<CommentRow, 'nick' | 'content_md'>
interface NotificationTemplate {
  name: string
  page: Pick<Page, 'title' | 'path'>
  comment: MailComment
  parent?: MailComment
  siteUrl: string
  pageUrl: string
  commentUrl: string
  unsubscribeUrl: string
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    character =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!
  )

// Email clients cannot use the site's stylesheet. Style only already-sanitized tags.
function content(markdown: string | null): string {
  const styles: Record<string, string> = {
    p: 'margin:8px 0;',
    a: 'color:#12ADDB;text-decoration:underline;',
    img: 'max-width:100%;vertical-align:middle;',
    pre: 'white-space:pre-wrap;word-break:break-word;background-color:#eeeeee;padding:10px;font-size:12px;',
    code: 'font-family:Consolas,monospace;font-size:12px;',
    blockquote:
      'margin:12px 0;padding-left:12px;border-left:3px solid #dddddd;color:#666666;',
    table: 'width:100%;border-collapse:collapse;font-size:12px;',
    th: 'border:1px solid #dddddd;padding:6px;text-align:left;',
    td: 'border:1px solid #dddddd;padding:6px;',
  }
  return renderMarkdown(markdown || '').replace(
    /<(p|a|img|pre|code|blockquote|table|th|td)(?=[\s>])/g,
    (tag, name: string) => `${tag} style="${styles[name]}"`
  )
}

export function renderNotificationEmail(input: NotificationTemplate) {
  const { page, comment, parent } = input
  const title = page.title || page.path
  const link = (url: string, label: string) =>
    `<a style="text-decoration:none;color:#12ADDB;" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`
  const quote = (value: MailComment) =>
    `<div style="background-color:#f5f5f5;padding:10px 15px;margin:18px 0;word-wrap:break-word;overflow-wrap:anywhere;">${content(value.content_md)}</div>`
  const subject = `[${input.name}] 👉 ${parent ? `叮咚！「${title}」上评论有了新回复` : `咚！「${title}」有新评论了`}`
  const heading = parent
    ? `您(${escape(parent.nick)}) 在 ${link(input.pageUrl, `《${title}》`)} 上的评论有了新的回复`
    : `「${escape(title)}」上有一条新评论，内容如下：`
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:20px 12px;background-color:#f7f8fa;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:500px;margin:30px auto;background-color:#ffffff;border-top:2px solid #12ADDB;box-shadow:0 1px 3px #aaaaaa;color:#555555;font-family:'Century Gothic','Trebuchet MS','Hiragino Sans GB','Microsoft Yahei',Tahoma,Helvetica,Arial,sans-serif;font-size:12px;line-height:180%;">
<tr><td style="padding:0 15px 12px;">
  <h2 style="border-bottom:1px solid #dddddd;font-size:14px;font-weight:normal;padding:13px 0 10px 8px;margin:0;">
    <span style="color:#12ADDB;font-weight:bold;">&gt; </span>${heading}
  </h2>
  <div style="padding:0 12px;margin-top:18px;">
    ${parent ? `<p>你的评论：</p>${quote(parent)}` : ''}
    <p><strong>${escape(comment.nick)}</strong>&nbsp;回复说：</p>
    ${quote(comment)}
    <p>${parent ? `您可以点击 ${link(input.commentUrl, '查看回复的完整內容')}，欢迎再次光临 ${link(input.siteUrl, title)}。` : link(input.commentUrl, '点击前往查看')}</p>
    <p style="margin-top:20px;padding-top:12px;border-top:1px solid #eeeeee;color:#666666;">
      本邮件为系统自动发送，请勿直接回复。<br>
      ${link(input.unsubscribeUrl, '停止邮件通知')}
    </p>
  </div>
</td></tr></table>
</body></html>`
  const text = [
    parent
      ? `您(${parent.nick}) 在《${title}》上的评论有了新的回复`
      : `「${title}」上有一条新评论，内容如下：`,
    ...(parent ? ['你的评论：', parent.content_md || ''] : []),
    `${comment.nick} 回复说：`,
    comment.content_md || '',
    `查看${parent ? '回复' : '评论'}：${input.commentUrl}`,
    '本邮件为系统自动发送，请勿直接回复。',
    `停止邮件通知：${input.unsubscribeUrl}`,
  ].join('\n\n')
  return { subject, html, text }
}
