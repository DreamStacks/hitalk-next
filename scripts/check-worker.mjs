import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'jsonc-parser'
import { verifyBackup } from './verify-backup.mjs'

const repo = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(
  new URL('../apps/server/package.json', import.meta.url)
)
const wrangler = require.resolve('wrangler')
const directory = mkdtempSync(join(tmpdir(), 'hitalk-check-'))
const config = join(directory, 'wrangler.jsonc')
const errors = []
const original = parse(
  readFileSync(join(repo, 'apps/server/wrangler.jsonc'), 'utf8'),
  errors,
  { allowTrailingComma: true }
)
if (errors.length) throw new Error('Invalid Wrangler configuration')
writeFileSync(
  config,
  JSON.stringify({
    name: 'hitalk-check',
    main: join(repo, 'apps/server/src/index.ts'),
    compatibility_date: original.compatibility_date,
    vars: {
      ADMIN_TOKEN: 'local-test-admin',
      IP_HASH_SALT: 'local-test-ip-salt',
    },
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'hitalk-check',
        database_id: '00000000-0000-0000-0000-000000000000',
        migrations_dir: join(repo, 'apps/server/migrations'),
      },
    ],
  })
)

function run(args) {
  const result = spawnSync(
    process.execPath,
    [wrangler, ...args, '--config', config],
    {
      cwd: directory,
      encoding: 'utf8',
      timeout: 60000,
      env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    }
  )
  if (result.status !== 0)
    throw new Error(result.error?.message || result.stderr || result.stdout)
  return result.stdout
}
async function availablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
let worker
async function stop() {
  if (!worker || worker.exitCode !== null) return
  await new Promise(resolve => {
    worker.once('exit', resolve)
    worker.kill('SIGTERM')
  })
}
try {
  run(['d1', 'migrations', 'apply', 'DB', '--local'])
  // Re-running migrations must be a no-op.
  run(['d1', 'migrations', 'apply', 'DB', '--local'])
  const port = await availablePort()
  worker = spawn(
    process.execPath,
    [
      wrangler,
      'dev',
      '--local',
      '--config',
      config,
      '--port',
      String(port),
      '--ip',
      '127.0.0.1',
    ],
    {
      cwd: directory,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    }
  )
  await new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(
      () => reject(new Error(`Worker startup timed out: ${output}`)),
      30000
    )
    const read = chunk => {
      output += chunk
      if (output.includes('Ready on')) {
        clearTimeout(timeout)
        resolve()
      }
    }
    worker.stdout.on('data', read)
    worker.stderr.on('data', read)
    worker.once('error', error => {
      clearTimeout(timeout)
      reject(error)
    })
    worker.once('exit', code => {
      clearTimeout(timeout)
      if (!output.includes('Ready on'))
        reject(new Error(`Worker exited ${code}: ${output}`))
    })
  })
  const base = `http://127.0.0.1:${port}`
  async function request(path, options = {}, expected = 200) {
    const response = await fetch(base + path, {
      ...options,
      signal: AbortSignal.timeout(10000),
    })
    const body = await response.json()
    assert.equal(response.status, expected, JSON.stringify(body))
    return body
  }
  const post = body =>
    request(
      '/comments',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      201
    )
  const root = await post({
    path: '/runtime',
    nick: 'Reader',
    email: 'reader@example.invalid',
    content: '**hello**',
  })
  await post({
    path: '/runtime',
    nick: 'Reply',
    content: 'reply',
    parent_id: root.id,
  })
  const likes = await Promise.all(
    Array.from({ length: 8 }, () =>
      request(`/comments/${root.id}/like`, { method: 'POST' })
    )
  )
  assert.equal(likes.filter(result => result.success).length, 1)
  assert.ok(likes.every(result => result.like_count === 1))
  const list = await request('/comments?path=/runtime&pageSize=1')
  assert.equal(list.total, 2)
  assert.equal(list.comments[0].children.length, 1)
  assert.ok(!('email' in list.comments[0]))
  await request('/admin/api/comments', {}, 401)
  await request('/comments', { method: 'POST', body: 'x'.repeat(140000) }, 413)
  await request(`/comments/${root.id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer local-test-admin' },
  })
  assert.equal((await request('/comments?path=/runtime')).total, 0)
  const kept = await post({
    path: '/backup',
    nick: 'Reader',
    content: 'preserved',
  })
  await post({
    path: '/backup',
    nick: 'Reply',
    content: 'preserved reply',
    parent_id: kept.id,
  })
  await request(`/comments/${kept.id}/like`, { method: 'POST' })
  await stop()
  const backup = join(directory, 'backup.sql')
  run(['d1', 'export', 'DB', '--local', '--output', backup])
  const restored = verifyBackup(readFileSync(backup, 'utf8'))
  assert.deepEqual(restored, { pages: 2, comments: 2, comment_likes: 1 })
  console.log(
    'Worker/D1 checks passed: migrations, HTTP API, concurrent likes, cascade counters, SQL export and restore.',
    restored
  )
} finally {
  await stop()
  rmSync(directory, { recursive: true, force: true })
}
