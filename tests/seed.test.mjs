import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { database } from './database.mjs'

const seed = readFileSync(
  new URL('../examples/playground/seed.sql', import.meta.url),
  'utf8'
)

test('playground seed preserves existing data and repeated imports keep counters consistent', t => {
  const { sqlite } = database()
  t.onTestFinished(() => sqlite.close())
  sqlite.exec(`INSERT INTO pages(path, title) VALUES('/playground', 'My existing page');
    INSERT INTO comments(id, page_id, nick, content_md) VALUES('existing', 1, 'Reader', 'Keep my comment');`)
  sqlite.exec(seed)
  sqlite.exec(
    "UPDATE comments SET content_md = 'Edited demo', ua = 'Custom-UA' WHERE id = 'demo-playground-01'"
  )
  sqlite.exec(seed)

  const page = sqlite
    .prepare("SELECT * FROM pages WHERE path = '/playground'")
    .get()
  assert.equal(page.title, 'My existing page')
  assert.equal(page.comment_count, 17)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get().n, 17)
  assert.equal(
    sqlite.prepare('SELECT COUNT(*) AS n FROM comment_likes').get().n,
    10
  )
  assert.equal(
    sqlite
      .prepare("SELECT content_md FROM comments WHERE id = 'existing'")
      .get().content_md,
    'Keep my comment'
  )
  assert.equal(
    sqlite
      .prepare(
        "SELECT content_md FROM comments WHERE id = 'demo-playground-01'"
      )
      .get().content_md,
    'Edited demo'
  )
  assert.equal(
    sqlite
      .prepare('SELECT COUNT(*) AS n FROM comments WHERE parent_id IS NULL')
      .get().n,
    13
  )
  assert.equal(
    sqlite
      .prepare(
        'SELECT COUNT(*) AS n FROM comments c WHERE like_count != (SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id=c.id)'
      )
      .get().n,
    0
  )
  assert.equal(
    sqlite
      .prepare("SELECT ua FROM comments WHERE id = 'demo-playground-01'")
      .get().ua,
    'Custom-UA'
  )
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), [])
})
