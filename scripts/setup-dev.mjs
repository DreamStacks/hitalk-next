import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
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

execFileSync('pnpm', ['run', 'db:migrate'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { ...process.env, CI: 'true' },
  stdio: ['ignore', 'inherit', 'inherit'],
})
