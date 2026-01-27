import type { HitalkPlugin, PluginContext, Comment, Page } from '@hitalk/shared'

/**
 * 邮件通知插件
 * 支持发送给博主和被回复者
 */
export const mailPlugin: HitalkPlugin = {
  name: 'mail-notification',
  version: '1.0.0',

  async onCommentCreated(
    ctx: PluginContext,
    comment: Comment,
    page: Page,
    parent?: Comment
  ) {
    const { env } = ctx
    const apiKey = env.RESEND_API_KEY
    const adminEmail = env.ADMIN_EMAIL
    const siteUrl = env.SITE_URL || ''

    if (!apiKey) {
      console.warn('[MailPlugin] RESEND_API_KEY is not set, skipping email.')
      return
    }

    // 1. 发送给管理员 (如果不是管理员自己发的)
    if (adminEmail && !comment.is_admin) {
      await sendEmail(apiKey, {
        from: 'Hitalk <onboarding@resend.dev>',
        to: adminEmail,
        subject: `[Hitalk] "${page.title || page.path}" 有新评论了`,
        html: `
          <h3>您的文章《${page.title || page.path}》收到了新评论</h3>
          <p><strong>${comment.nick}:</strong></p>
          <blockquote>${comment.content_html}</blockquote>
          <p><a href="${siteUrl}${page.path}">点击查看详情</a></p>
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
        from: 'Hitalk <onboarding@resend.dev>',
        to: parent.email,
        subject: `您在 "${page.title || page.path}" 的评论有了新回复`,
        html: `
          <h3>您好 ${parent.nick}，您的评论有了新回复:</h3>
          <p><strong>${comment.nick}:</strong></p>
          <blockquote>${comment.content_html}</blockquote>
          <p>原评论:</p>
          <blockquote style="color: #666;">${parent.content_html}</blockquote>
          <p><a href="${siteUrl}${page.path}">点击查看详情</a></p>
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
      console.log(`[MailPlugin] Email sent to ${data.to}`)
    }
  } catch (error) {
    console.error('[MailPlugin] Error sending email:', error)
  }
}
