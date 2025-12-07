import { mkdir, readFile } from 'node:fs/promises'
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

  // Get applied migrations before
  const appliedBefore = new Set<string>()
  try {
    const rows = sqlite.query('SELECT hash FROM __drizzle_migrations').all() as { hash: string }[]
    for (const row of rows) appliedBefore.add(row.hash)
  } catch {
    // Table doesn't exist yet
  }

  // Read journal to know migration names
  const journalPath = join(migrationsFolder, 'meta/_journal.json')
  const journal = JSON.parse(await readFile(journalPath, 'utf-8')) as {
    entries: { idx: number; tag: string }[]
  }

  try {
    migrate(db, { migrationsFolder })

    // Get applied migrations after
    const rows = sqlite.query('SELECT hash FROM __drizzle_migrations').all() as { hash: string }[]
    const appliedAfter = new Set(rows.map((r) => r.hash))

    // Find newly applied
    const newlyApplied = [...appliedAfter].filter((h) => !appliedBefore.has(h))

    if (newlyApplied.length === 0) {
      console.log('No new migrations to apply.')
    } else {
      console.log(`Applied ${newlyApplied.length} migration(s):`)
      // Show migration names from journal (order by idx)
      const total = journal.entries.length
      const startIdx = total - newlyApplied.length
      for (let i = startIdx; i < total; i++) {
        console.log(`  - ${journal.entries[i].tag}`)
      }
    }
    console.log('Migrations completed successfully!')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    sqlite.close()
  }
}

runMigrations()
