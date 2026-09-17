import { spawn, execFile } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parse } from 'jsonc-parser'

const execute = promisify(execFile)
const repo = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(
  new URL('../../apps/server/package.json', import.meta.url)
)
const wrangler = require.resolve('wrangler')

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

/** Start the real CLI with an isolated database and no development secrets. */
export async function startWorker() {
  const directory = await mkdtemp(join(tmpdir(), 'hitalk-integration-'))
  const config = join(directory, 'wrangler.jsonc')
  const environment = {
    ...process.env,
    CI: 'true',
    WRANGLER_SEND_METRICS: 'false',
  }
  let processHandle
  const run = async args =>
    (
      await execute(process.execPath, [wrangler, ...args, '--config', config], {
        cwd: directory,
        env: environment,
        timeout: 45000,
        maxBuffer: 4 * 1024 * 1024,
      })
    ).stdout
  async function stop() {
    if (
      !processHandle ||
      processHandle.exitCode !== null ||
      processHandle.signalCode !== null
    )
      return
    const exited = once(processHandle, 'exit')
    const force = setTimeout(() => processHandle.kill('SIGKILL'), 5000)
    try {
      processHandle.kill('SIGTERM')
      await exited
    } finally {
      clearTimeout(force)
    }
  }
  async function dispose() {
    try {
      await stop()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
  try {
    const errors = []
    const original = parse(
      await readFile(join(repo, 'apps/server/wrangler.jsonc'), 'utf8'),
      errors,
      { allowTrailingComma: true }
    )
    if (errors.length) throw new Error('Invalid Wrangler configuration')
    await writeFile(
      config,
      JSON.stringify({
        name: 'hitalk-integration',
        main: join(repo, 'apps/server/src/index.ts'),
        compatibility_date: original.compatibility_date,
        vars: {
          ADMIN_TOKEN: 'local-test-admin',
          IP_HASH_SALT: 'local-test-ip-salt',
        },
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'hitalk-integration',
            database_id: '00000000-0000-0000-0000-000000000000',
            migrations_dir: join(repo, 'apps/server/migrations'),
          },
        ],
      })
    )
    await run(['d1', 'migrations', 'apply', 'DB', '--local'])
    await run(['d1', 'migrations', 'apply', 'DB', '--local'])
    const port = await availablePort()
    processHandle = spawn(
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
        env: environment,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )
    await new Promise((resolve, reject) => {
      let output = ''
      const timeout = setTimeout(
        () => finish(new Error(`Worker startup timed out: ${output}`)),
        30000
      )
      const finish = error => {
        clearTimeout(timeout)
        processHandle.stdout.off('data', read)
        processHandle.stderr.off('data', read)
        processHandle.off('error', failed)
        processHandle.off('exit', exited)
        if (error) reject(error)
        else resolve()
      }
      const read = chunk => {
        output = (output + chunk).slice(-16000)
        if (output.includes('Ready on')) finish()
      }
      const failed = error => finish(error)
      const exited = code =>
        finish(new Error(`Worker exited ${code}: ${output}`))
      processHandle.stdout.on('data', read)
      processHandle.stderr.on('data', read)
      processHandle.once('error', failed)
      processHandle.once('exit', exited)
    })
    // Drain log pipes after readiness so a chatty worker cannot block on stdout.
    processHandle.stdout.resume()
    processHandle.stderr.resume()
    return {
      url: `http://127.0.0.1:${port}`,
      dispose,
      async exportBackup() {
        await stop()
        const backup = join(directory, 'backup.sql')
        await run(['d1', 'export', 'DB', '--local', '--output', backup])
        return readFile(backup, 'utf8')
      },
    }
  } catch (error) {
    await dispose()
    throw error
  }
}
