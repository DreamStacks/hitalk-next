import type { Bindings, CommentRow, Page } from '../types'
import { renderNotificationEmail } from './notification-template'
interface Job {
  id: string
  comment_id: string
  recipient: string
  kind: string
  attempts: number
  created_at: number
  first_attempt_at: number | null
  payload_json: string | null
}
/** Bounded, durable attempts. Claim and completion both compare a lease token. */
export async function processNotifications(env: Bindings, now = Date.now()) {
  if (
    env.EMAIL_ENABLED !== 'true' ||
    !env.RESEND_API_KEY ||
    !env.EMAIL_FROM ||
    !env.SITE_URL ||
    !env.NOTIFICATION_API_URL
  )
    return
  const jobs = await env.DB.prepare(`SELECT * FROM notification_jobs WHERE
    (status='pending' AND next_attempt_at<=?) OR (status='sending' AND lease_until<=?) ORDER BY created_at LIMIT 10`)
    .bind(now, now)
    .all<Job>()
  for (const job of jobs.results) {
    const lease = crypto.randomUUID()
    const claimed =
      await env.DB.prepare(`UPDATE notification_jobs SET status='sending',lease_token=?,lease_until=?,first_attempt_at=COALESCE(first_attempt_at,?),attempts=attempts+1
      WHERE id=? AND ((status='pending' AND next_attempt_at<=?) OR (status='sending' AND lease_until<=?))`)
        .bind(lease, now + 60000, now, job.id, now, now)
        .run()
    if (!claimed.meta.changes) continue
    const finish = async (
      status: string,
      error: string | null = null,
      next = 0
    ) => {
      await env.DB.prepare(
        "UPDATE notification_jobs SET status=?,last_error=?,next_attempt_at=?,lease_until=0,lease_token=NULL,payload_json=CASE WHEN ? IN ('sent','cancelled') THEN NULL ELSE payload_json END WHERE id=? AND lease_token=?"
      )
        .bind(status, error, next, status, job.id, lease)
        .run()
    }
    if (
      now - (job.first_attempt_at ?? now) >= 23 * 3600000 ||
      job.attempts >= 8
    ) {
      await finish('failed', 'retry_window_exceeded')
      continue
    }
    const row = await env.DB.prepare(
      'SELECT * FROM visible_comments WHERE id=?'
    )
      .bind(job.comment_id)
      .first<CommentRow>()
    const suppressed = await env.DB.prepare(
      'SELECT 1 FROM email_suppressions WHERE recipient=?'
    )
      .bind(job.recipient)
      .first()
    const parent =
      job.kind === 'reply'
        ? await env.DB.prepare(
            'SELECT * FROM visible_comments WHERE id=? AND notify=1 AND lower(email)=?'
          )
            .bind(row?.reply_to_id || '', job.recipient)
            .first<CommentRow>()
        : null
    if (!row || suppressed || (job.kind === 'reply' && !parent)) {
      await finish('cancelled')
      continue
    }
    const page = await env.DB.prepare('SELECT * FROM pages WHERE id=?')
      .bind(row.page_id)
      .first<Page>()
    try {
      const site = new URL(env.SITE_URL)
      const link = new URL(page!.path, site)
      if (
        !['http:', 'https:'].includes(site.protocol) ||
        link.origin !== site.origin
      )
        throw new Error('invalid_site_url')
      // The unsubscribe capability lives in the email only; the public API never exposes job IDs.
      const unsubscribe = new URL(
        `/api/notifications/unsubscribe/${job.id}`,
        env.NOTIFICATION_API_URL
      )
      const commentLink = new URL(link)
      commentLink.hash = row.id
      const payload =
        job.payload_json ||
        JSON.stringify({
          from: env.EMAIL_FROM,
          to: job.recipient,
          ...renderNotificationEmail({
            name: env.EMAIL_NAME || 'Hitalk',
            page: page!,
            comment: row,
            parent: parent || undefined,
            siteUrl: site.href,
            pageUrl: link.href,
            commentUrl: commentLink.href,
            unsubscribeUrl: unsubscribe.href,
          }),
        })
      const saved = await env.DB.prepare(
        "UPDATE notification_jobs SET payload_json=COALESCE(payload_json,?) WHERE id=? AND lease_token=? AND status='sending'"
      )
        .bind(payload, job.id, lease)
        .run()
      if (!saved.meta.changes) continue
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `hitalk/${job.id}`,
        },
        body: payload,
      })
      if (response.ok) await finish('sent')
      else if (
        response.status === 429 ||
        response.status >= 500 ||
        (response.status === 409 &&
          ((await response.json()) as { name?: string }).name ===
            'concurrent_idempotent_requests')
      )
        await finish(
          'pending',
          `provider_${response.status}`,
          now + Math.min(3600000, 30000 * 2 ** job.attempts)
        )
      else await finish('failed', `provider_${response.status}`)
    } catch {
      await finish(
        'pending',
        'delivery_unconfirmed',
        now + Math.min(3600000, 30000 * 2 ** job.attempts)
      )
    }
  }
}

export function notificationStatements(
  db: D1Database,
  id: string,
  env: Bindings
): D1PreparedStatement[] {
  if (env.EMAIL_ENABLED !== 'true') return []
  const now = Date.now()
  const statements: D1PreparedStatement[] = []
  if (env.ADMIN_EMAIL)
    statements.push(
      db
        .prepare(`INSERT INTO notification_jobs(id,comment_id,recipient,kind,created_at)
    SELECT ?,id,lower(?),'owner',? FROM visible_comments WHERE id=? AND author_id!='site-owner' ON CONFLICT(comment_id,recipient) DO NOTHING`)
        .bind(crypto.randomUUID(), env.ADMIN_EMAIL, now, id)
    )
  statements.push(
    db
      .prepare(`INSERT INTO notification_jobs(id,comment_id,recipient,kind,created_at)
    SELECT ?,c.id,lower(p.email),'reply',? FROM visible_comments c JOIN comments p ON p.id=c.reply_to_id
    WHERE c.id=? AND p.notify=1 AND p.email IS NOT NULL AND p.deleted_at IS NULL AND p.author_id!=c.author_id
      AND lower(p.email)!=lower(COALESCE(c.email,'')) AND NOT EXISTS(SELECT 1 FROM email_suppressions s WHERE s.recipient=lower(p.email))
    ON CONFLICT(comment_id,recipient) DO NOTHING`)
      .bind(crypto.randomUUID(), now, id)
  )
  return statements
}
