import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** Restore into a disposable database and verify structure, relations and derived counts. */
export function verifyBackup(sql) {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(sql)
    db.exec('PRAGMA foreign_keys=ON')
    const integrity = db.prepare('PRAGMA integrity_check').get()
    if (integrity.integrity_check !== 'ok')
      throw new Error('SQLite integrity check failed')
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Foreign key check failed')
    const invalid = db
      .prepare(`SELECT COUNT(*) AS n FROM comments c LEFT JOIN comments r ON r.id=c.root_id LEFT JOIN comments p ON p.id=c.reply_to_id
      WHERE c.root_id IS NOT NULL AND (r.root_id IS NOT NULL OR r.page_id!=c.page_id OR p.page_id!=c.page_id OR COALESCE(p.root_id,p.id)!=r.id OR p.seq>=c.seq)`)
      .get()
    if (invalid.n) throw new Error('Invalid thread relationships')
    if (
      !db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='view' AND name='visible_comments'"
        )
        .get()
    )
      throw new Error('Missing visibility view')
    const expectedTriggers = [
      'comments_parent_insert',
      'comments_identity_update',
      'comments_write_guard',
      'likes_write_guard',
      'comments_pin_limit',
    ]
    const triggers = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='trigger'")
        .all()
        .map(row => row.name)
    )
    for (const name of expectedTriggers)
      if (!triggers.has(name)) throw new Error(`Missing trigger: ${name}`)
    return Object.fromEntries(
      [
        'identities',
        'pages',
        'comments',
        'comment_likes',
        'notification_jobs',
      ].map(table => [
        table,
        db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total,
      ])
    )
  } finally {
    db.close()
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.argv[2]) {
    console.error('Usage: pnpm db:verify-backup /absolute/path/to/backup.sql')
    process.exitCode = 1
  } else {
    try {
      console.log(
        'Restore verified:',
        verifyBackup(readFileSync(process.argv[2], 'utf8'))
      )
    } catch (error) {
      console.error('Restore verification failed:', error.message)
      process.exitCode = 1
    }
  }
}
