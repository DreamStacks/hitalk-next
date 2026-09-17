import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const migrationsDirectory = fileURLToPath(
  new URL('../apps/server/migrations/', import.meta.url)
)
export function migrate(
  sqlite,
  files = readdirSync(migrationsDirectory).sort()
) {
  for (const file of files)
    sqlite.exec(readFileSync(`${migrationsDirectory}/${file}`, 'utf8'))
}

/** Real SQLite is used only to verify portable SQL backups outside Workers. */
export function database() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys=ON')
  migrate(sqlite)
  return { sqlite }
}
