import { test } from 'vitest'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { database } from './database.mjs'
import { verifyBackup } from '../scripts/verify-backup.mjs'

// SQL dump shape used by SQLite/D1: table definitions and rows, then indexes/triggers.
function dump(sqlite) {
  const schema = sqlite
    .prepare(
      "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid"
    )
    .all()
  const sql = ['PRAGMA foreign_keys=OFF;']
  const literal = value =>
    value === null
      ? 'NULL'
      : typeof value === 'string'
        ? "'" + value.replaceAll("'", "''") + "'"
        : String(value)
  for (const table of schema.filter(item => item.type === 'table')) {
    sql.push(table.sql + ';')
    for (const row of sqlite.prepare(`SELECT * FROM ${table.name}`).all())
      sql.push(
        `INSERT INTO ${table.name} VALUES(${Object.values(row).map(literal).join(',')});`
      )
  }
  for (const object of schema.filter(item => item.type !== 'table'))
    sql.push(object.sql + ';')
  return sql.join('\n')
}

test('SQL export restores identities, threads, likes and integrity guards', () => {
  const { sqlite } = database()
  try {
    sqlite.exec(
      readFileSync(
        new URL('../examples/playground/seed.sql', import.meta.url),
        'utf8'
      )
    )
    assert.deepEqual(verifyBackup(dump(sqlite)), {
      identities: 2,
      pages: 1,
      comments: 16,
      comment_likes: 10,
      notification_jobs: 0,
    })
    sqlite.exec('DROP TRIGGER comments_parent_insert')
    assert.throws(() => verifyBackup(dump(sqlite)), /Missing trigger/)
  } finally {
    sqlite.close()
  }
})
