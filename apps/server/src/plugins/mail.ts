import type { HitalkPlugin, PluginContext, CommentRow, Page } from '../types'
import { renderMarkdown } from '../lib/markdown'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 邮件通知插件
 * 支持发送给博主和被回复者
 */
export const mailPlugin: HitalkPlugin = {
  name: 'mail-notification',
  version: '1.0.0',

  async onCommentCreated(
    ctx: PluginContext,
    comment: CommentRow,
    page: Page,
    parent?: CommentRow
  ) {
    const { env } = ctx
    const apiKey = env.RESEND_API_KEY
    const adminEmail = env.ADMIN_EMAIL
    const emailName = env.EMAIL_NAME || 'Hitalk'
    const siteUrl = env.SITE_URL || ''
    const from = env.EMAIL_FROM
    if (!from) return
    let pageUrl: string
    try {
      const base = new URL(siteUrl)
      if (!['http:', 'https:'].includes(base.protocol)) return
      const target = new URL(page.path, base)
      if (target.origin !== base.origin) return
      pageUrl = escapeHtml(target.href)
    } catch {
      return
    }

    if (!apiKey) {
      console.warn('[MailPlugin] RESEND_API_KEY is not set, skipping email.')
      return
    }

    // 1. 发送给管理员 (如果不是管理员自己发的)
    if (adminEmail && !comment.is_admin) {
      await sendEmail(apiKey, {
        from,
        to: adminEmail,
        subject: `[${emailName}] 👉 咚！「${page.title || page.path}」有新评论了`,
        html: `
          <div style="background-color:white;border-top:2px solid #12ADDB;box-shadow:0 1px 3px #AAAAAA;line-height:180%;padding:0 15px 12px;width:500px;margin:50px auto;color:#555555;font-family:'Century Gothic','Trebuchet MS','Hiragino Sans GB',微软雅黑,'Microsoft Yahei',Tahoma,Helvetica,Arial,'SimSun',sans-serif;font-size:12px;">
            <h2 style="border-bottom:1px solid #DDD;font-size:14px;font-weight:normal;padding:13px 0 10px 8px;">
              <span style="color:#12ADDB;font-weight:bold;">&gt; </span>
              「${escapeHtml(page.title || page.path)}」上有一条新评论，内容如下：
            </h2>

            <div style="padding:0 12px;margin-top:18px">
              <p>
                <strong>${escapeHtml(comment.nick)}</strong>&nbsp;回复说：
              </p>

              <div style="background-color:#f5f5f5;padding:10px 15px;margin:18px 0;word-wrap:break-word;">
                ${renderMarkdown(comment.content_md)}
              </div>

              <p>
                <a
                  style="text-decoration:none;color:#12addb"
                  href="${pageUrl}#comments"
                  target="_blank"
                >
                  点击前往查看
                </a>
              </p>
            </div>
          </div>
          `,
      })
    }

    // 2. 发送给被回复者 (由子评论回复他人)
    if (
      parent &&
      parent.email &&
      parent.email !== adminEmail &&
      parent.email !== comment.email
    ) {
      await sendEmail(apiKey, {
        from,
        to: parent.email,
        subject: `[${emailName}] 👉 叮咚！「${page.title || page.path}」上评论有了新回复`,
        html: `
          <div style="border-top:2px solid #12ADDB;box-shadow:0 1px 3px #AAAAAA;line-height:180%;padding:0 15px 12px;width:500px;margin:50px auto;font-size:12px;">
            <h2 style="border-bottom:1px solid #DDD;font-size:14px;font-weight:normal;padding:13px 0 10px 8px;">
              <span style="color:#12ADDB;font-weight:bold;">&gt; </span>
              您(${escapeHtml(parent.nick)}) 在
              <a
                style="text-decoration:none;color:#12ADDB;"
                href="${pageUrl}"
                target="_blank"
              >
                《${escapeHtml(page.title || page.path)}》
              </a>
              上的评论有了新的回复
            </h2>

            <div style="padding:0 12px;margin-top:18px">
              <p>你的评论：</p>
              <div style="background-color:#f5f5f5;padding:10px 15px;margin:18px 0;word-wrap:break-word;">
                ${renderMarkdown(parent.content_md)}
              </div>

              <p>
                <strong>${escapeHtml(comment.nick)}</strong>&nbsp;回复说：
              </p>
              <div style="background-color:#f5f5f5;padding:10px 15px;margin:18px 0;word-wrap:break-word;">
                ${renderMarkdown(comment.content_md)}
              </div>

              <p>
                您可以点击
                <a
                  style="text-decoration:none;color:#12addb"
                  href="${pageUrl}#comments"
                  target="_blank"
                >
                  查看回复的完整內容
                </a>
                ，欢迎再次光临
                <a
                  style="text-decoration:none;color:#12addb"
                  href="${escapeHtml(siteUrl)}"
                  target="_blank"
                >
                  ${escapeHtml(page.title || page.path)}
                </a>。
                <br />
                本邮件为系统自动发送，请勿直接回复。
              </p>
            </div>
          </div>
          `,
      })
    }
  },
}

/**
 * 调用 Resend API 发送邮件
 */
async function sendEmail(
  apiKey: string,
  data: { from: string; to: string; subject: string; html: string }
) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      const error = await res.json()
      console.error('[MailPlugin] Failed to send email:', error)
    } else {
      console.log('[MailPlugin] Email sent')
    }
  } catch (error) {
    console.error('[MailPlugin] Error sending email:', error)
  }
}
