import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { database } from './database.mjs'
const seed = readFileSync(
  new URL('../examples/playground/seed.sql', import.meta.url),
  'utf8'
)
test('local seed is repeatable and does not overwrite existing pages or comments', t => {
  const { sqlite } = database()
  t.onTestFinished(() => sqlite.close())
  sqlite.exec(
    "INSERT INTO pages(path,title) VALUES('/playground','Existing title')"
  )
  sqlite.exec(seed)
  sqlite.exec("UPDATE comments SET content_md='Edited' WHERE id='demo-1'")
  sqlite.exec(seed)
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM comments').get().n, 16)
  assert.equal(
    sqlite.prepare('SELECT COUNT(*) n FROM comment_likes').get().n,
    10
  )
  assert.equal(
    sqlite.prepare('SELECT title FROM pages').get().title,
    'Existing title'
  )
  assert.equal(
    sqlite.prepare("SELECT content_md FROM comments WHERE id='demo-1'").get()
      .content_md,
    'Edited'
  )
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), [])
})
