import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const file = new URL('../apps/server/.dev.vars', import.meta.url)
try {
  await writeFile(
    file,
    [
      '# Local development only. Do not commit this file.',
      `ADMIN_TOKEN=${randomBytes(32).toString('hex')}`,
      `IP_HASH_SALT=${randomBytes(32).toString('hex')}`,
      '',
    ].join('\n'),
    { flag: 'wx', mode: 0o600 }
  )
  console.log(
    'Created apps/server/.dev.vars with local random secrets. Email is disabled by default.'
  )
} catch (error) {
  if (error.code !== 'EEXIST') throw error
  console.log('Using existing apps/server/.dev.vars.')
}

const require = createRequire(
  new URL('../apps/server/package.json', import.meta.url)
)
execFileSync(
  process.execPath,
  [require.resolve('wrangler'), 'd1', 'migrations', 'apply', 'DB', '--local'],
  {
    cwd: fileURLToPath(new URL('../apps/server/', import.meta.url)),
    env: { ...process.env, CI: 'true' },
    stdio: ['ignore', 'inherit', 'inherit'],
  }
)
