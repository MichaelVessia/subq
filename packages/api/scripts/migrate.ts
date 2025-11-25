import { SqlClient } from '@effect/sql'
import { Effect } from 'effect'
import { SqlLive } from '../src/Sql.js'
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../migrations')

interface Migration {
  name: string
  sql: string
}

// Load all migration files from disk
const loadMigrations = Effect.tryPromise(async () => {
  const files = await readdir(MIGRATIONS_DIR)
  const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort()

  const migrations: Migration[] = []
  for (const file of sqlFiles) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8')
    migrations.push({ name: file, sql })
  }
  return migrations
})

// Get list of already-applied migrations from database
const getAppliedMigrations = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  // First ensure the migrations table exists
  yield* sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  const rows = yield* sql<{ name: string }>`
    SELECT name FROM _migrations ORDER BY name
  `
  return rows.map((r) => r.name)
})

// Apply a single migration
const applyMigration = (migration: Migration) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    console.log(`Applying migration: ${migration.name}`)

    // Run the migration SQL
    yield* sql.unsafe(migration.sql)

    // Record that we applied it
    yield* sql`
      INSERT INTO _migrations (name) VALUES (${migration.name})
    `

    console.log(`  Applied successfully`)
  })

// Main migration program
const migrate = Effect.gen(function* () {
  const allMigrations = yield* loadMigrations
  const appliedNames = yield* getAppliedMigrations

  const pending = allMigrations.filter((m) => !appliedNames.includes(m.name))

  if (pending.length === 0) {
    console.log('No pending migrations.')
    return
  }

  console.log(`Found ${pending.length} pending migration(s):\n`)

  for (const migration of pending) {
    yield* applyMigration(migration)
  }

  console.log(`\nAll migrations applied!`)
})

// Run it
Effect.runPromise(migrate.pipe(Effect.provide(SqlLive)))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
