import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

// Path to the SQLite database (default: ./data/subq.db)
const DATABASE_PATH = process.env.DATABASE_PATH || './data/subq.db'

async function runMigrations() {
  // Ensure the data directory exists
  await mkdir(dirname(DATABASE_PATH), { recursive: true })

  console.log(`Running migrations on: ${DATABASE_PATH}`)

  // Open the database
  const sqlite = new Database(DATABASE_PATH)
  const db = drizzle(sqlite)

  // Run drizzle migrations from the drizzle folder
  const migrationsFolder = join(import.meta.dir, '../drizzle')

  try {
    migrate(db, { migrationsFolder })
    console.log('Migrations completed successfully!')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    sqlite.close()
  }
}

runMigrations()
