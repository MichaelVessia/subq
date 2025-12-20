/**
 * Database setup script - runs with bun to use bun:sqlite
 * Called from global-setup.ts via spawnSync
 */

import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

const TEST_DB_PATH = process.env.TEST_DB_PATH!
const TEST_AUTH_SECRET = process.env.TEST_AUTH_SECRET!
const TEST_AUTH_URL = process.env.TEST_AUTH_URL!
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL!
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD!
const TEST_USER_NAME = process.env.TEST_USER_NAME!

const PROJECT_ROOT = join(import.meta.dir, '../../../..')
const DRIZZLE_DIR = join(PROJECT_ROOT, 'packages/api/drizzle')

async function main() {
  console.log(`Setting up test database: ${TEST_DB_PATH}`)

  // Create database and run migrations
  const sqlite = new Database(TEST_DB_PATH)
  const db = drizzle(sqlite)

  // Run drizzle migrations
  console.log('Running drizzle migrations...')
  migrate(db, { migrationsFolder: DRIZZLE_DIR })

  // Run better-auth migrations
  console.log('Running better-auth migrations...')
  const authOptions = {
    database: sqlite,
    secret: TEST_AUTH_SECRET,
    baseURL: TEST_AUTH_URL,
    emailAndPassword: { enabled: true },
  }

  const { runMigrations } = await getMigrations(authOptions)
  await runMigrations()

  // Create test user
  console.log(`Creating test user: ${TEST_USER_EMAIL}`)
  const auth = betterAuth(authOptions)
  await auth.api.signUpEmail({
    body: {
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
      name: TEST_USER_NAME,
    },
  })

  sqlite.close()
  console.log('Database setup complete')
}

main().catch((err) => {
  console.error('Database setup failed:', err)
  process.exit(1)
})
