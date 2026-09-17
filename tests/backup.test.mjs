import { test } from 'vitest'
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

test('SQL export restores populated tables and all integrity triggers', () => {
  const { sqlite } = database()
  try {
    sqlite.exec(`INSERT INTO pages(path) VALUES('/article');
      INSERT INTO comments(id,page_id,nick,content_md) VALUES('root',1,'Reader','hello');
      INSERT INTO comments(id,page_id,parent_id,nick,content_md) VALUES('reply',1,'root','Reader','reply');
      INSERT INTO comment_likes(comment_id,ip_hash) VALUES('reply','example-hash');`)
    assert.deepEqual(verifyBackup(dump(sqlite)), {
      pages: 1,
      comments: 2,
      comment_likes: 1,
    })
    sqlite.exec('UPDATE pages SET comment_count=99')
    assert.throws(() => verifyBackup(dump(sqlite)), /counters/)
    sqlite.exec(
      'UPDATE pages SET comment_count=2; DROP TRIGGER likes_count_insert'
    )
    assert.throws(() => verifyBackup(dump(sqlite)), /Missing trigger/)
  } finally {
    sqlite.close()
  }
})
