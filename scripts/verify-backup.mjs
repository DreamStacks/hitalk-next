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
    const counts = db
      .prepare(
        `SELECT COUNT(*) AS total FROM pages p WHERE comment_count != (SELECT COUNT(*) FROM comments WHERE page_id=p.id)`
      )
      .get()
    if (counts.total) throw new Error('Comment counters are inconsistent')
    const likes = db
      .prepare(
        `SELECT COUNT(*) AS total FROM comments c WHERE like_count != (SELECT COUNT(*) FROM comment_likes WHERE comment_id=c.id)`
      )
      .get()
    if (likes.total) throw new Error('Like counters are inconsistent')
    const invalidParents = db
      .prepare(
        `SELECT COUNT(*) AS total FROM comments c JOIN comments p ON p.id=c.parent_id WHERE c.page_id != p.page_id`
      )
      .get()
    if (invalidParents.total) throw new Error('Cross-page replies found')
    const cycles = db
      .prepare(`WITH RECURSIVE ancestry(start,id) AS (
      SELECT id,parent_id FROM comments WHERE parent_id IS NOT NULL UNION
      SELECT ancestry.start,c.parent_id FROM comments c JOIN ancestry ON c.id=ancestry.id WHERE c.parent_id IS NOT NULL
    ) SELECT COUNT(*) AS total FROM ancestry WHERE start=id`)
      .get()
    if (cycles.total) throw new Error('Cyclic replies found')
    const expectedTriggers = [
      'comments_parent_insert',
      'comments_identity_update',
      'comments_count_insert',
      'comments_count_delete',
      'likes_count_insert',
      'likes_count_delete',
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
      ['pages', 'comments', 'comment_likes'].map(table => [
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
