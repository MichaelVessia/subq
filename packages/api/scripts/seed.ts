import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { SqlClient } from '@effect/sql'
import { Database } from 'bun:sqlite'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { Config, Effect } from 'effect'
import { SqlLive } from '../src/sql.js'
import { generateConsistentUserData } from './seed-data.js'

// Test user credentials
const TEST_USER = { email: 'consistent@example.com', password: 'testpassword123', name: 'Demo User' }

// Helper to create or get a user
const getOrCreateUser = (
  sql: SqlClient.SqlClient,
  auth: ReturnType<typeof betterAuth>,
  email: string,
  password: string,
  name: string,
) =>
  Effect.gen(function* () {
    // Check if user exists first
    const existingUser = yield* sql`SELECT id FROM user WHERE email = ${email}`
    if (existingUser.length > 0) {
      const userId = existingUser[0].id as string
      console.log(`Using existing user: ${email} (ID: ${userId})`)
      return userId
    }

    // Create new user
    const signUpResult = yield* Effect.tryPromise(() =>
      auth.api.signUpEmail({
        body: { email, password, name },
      }),
    )
    console.log(`Created user: ${email} (ID: ${signUpResult.user.id})`)
    return signUpResult.user.id
  })

const seedData = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const databasePath = yield* Config.string('DATABASE_PATH').pipe(Config.withDefault('./data/subq.db'))
  const authSecret = yield* Config.string('BETTER_AUTH_SECRET')
  const authUrl = yield* Config.string('BETTER_AUTH_URL')

  // Ensure data directory exists
  yield* Effect.tryPromise(() => mkdir(dirname(databasePath), { recursive: true }))

  // Create better-auth instance with better-sqlite3 for auth migrations
  const sqlite = new Database(databasePath)
  const authOptions = {
    database: sqlite,
    secret: authSecret,
    baseURL: authUrl,
    emailAndPassword: {
      enabled: true,
    },
  }

  // Run drizzle migrations for app tables
  console.log('Running drizzle migrations...')
  const drizzleDb = drizzle(sqlite)
  const migrationsFolder = join(import.meta.dir, '../drizzle')
  migrate(drizzleDb, { migrationsFolder })

  // Run better-auth migrations
  console.log('Running better-auth migrations...')
  const { runMigrations } = yield* Effect.promise(() => getMigrations(authOptions))
  yield* Effect.promise(runMigrations)

  const auth = betterAuth(authOptions)

  // Create user
  console.log('Setting up test user...')
  const userId = yield* getOrCreateUser(sql, auth, TEST_USER.email, TEST_USER.password, TEST_USER.name)

  // Seed data
  yield* seedConsistentUser(sql, userId)

  console.log('\nSeed data complete!')
  console.log(`\nTest user credentials:`)
  console.log(`  ${TEST_USER.name}: ${TEST_USER.email} / ${TEST_USER.password}`)

  // Clean up the sqlite connection
  sqlite.close()
})

// Seed consistent user using shared generators
const seedConsistentUser = (sql: SqlClient.SqlClient, userId: string) =>
  Effect.gen(function* () {
    // Clear existing data for this user
    yield* sql`DELETE FROM weight_logs WHERE user_id = ${userId}`
    yield* sql`DELETE FROM injection_logs WHERE user_id = ${userId}`
    yield* sql`DELETE FROM schedule_phases WHERE schedule_id IN (SELECT id FROM injection_schedules WHERE user_id = ${userId})`
    yield* sql`DELETE FROM injection_schedules WHERE user_id = ${userId}`
    yield* sql`DELETE FROM glp1_inventory WHERE user_id = ${userId}`

    console.log(`\nGenerating 1 year of consistent data for user ${userId}...`)

    const data = generateConsistentUserData()

    // Insert schedules
    for (const schedule of data.schedules) {
      yield* sql`
        INSERT INTO injection_schedules (id, name, drug, source, frequency, start_date, is_active, notes, user_id, created_at, updated_at)
        VALUES (${schedule.id}, ${schedule.name}, ${schedule.drug}, ${schedule.source}, ${schedule.frequency}, ${schedule.startDate}, ${schedule.isActive ? 1 : 0}, ${schedule.notes}, ${userId}, ${schedule.createdAt}, ${schedule.updatedAt})
      `
    }
    console.log(`Inserted ${data.schedules.length} schedules`)

    // Insert phases
    for (const phase of data.phases) {
      yield* sql`
        INSERT INTO schedule_phases (id, schedule_id, "order", duration_days, dosage, created_at, updated_at)
        VALUES (${phase.id}, ${phase.scheduleId}, ${phase.order}, ${phase.durationDays}, ${phase.dosage}, ${phase.createdAt}, ${phase.updatedAt})
      `
    }
    console.log(`Inserted ${data.phases.length} phases`)

    // Insert injections
    for (const inj of data.injections) {
      yield* sql`
        INSERT INTO injection_logs (id, datetime, drug, source, dosage, injection_site, notes, schedule_id, user_id, created_at, updated_at)
        VALUES (${inj.id}, ${inj.datetime}, ${inj.drug}, ${inj.source}, ${inj.dosage}, ${inj.injectionSite}, ${inj.notes}, ${inj.scheduleId}, ${userId}, ${inj.createdAt}, ${inj.updatedAt})
      `
    }
    console.log(`Inserted ${data.injections.length} injection logs`)

    // Insert weights
    for (const weight of data.weights) {
      yield* sql`
        INSERT INTO weight_logs (id, datetime, weight, unit, notes, user_id, created_at, updated_at)
        VALUES (${weight.id}, ${weight.datetime}, ${weight.weight}, ${weight.unit}, ${weight.notes}, ${userId}, ${weight.createdAt}, ${weight.updatedAt})
      `
    }
    console.log(`Inserted ${data.weights.length} weight logs`)

    // Insert inventory
    for (const inv of data.inventory) {
      yield* sql`
        INSERT INTO glp1_inventory (id, drug, source, form, total_amount, status, beyond_use_date, user_id, created_at, updated_at)
        VALUES (${inv.id}, ${inv.drug}, ${inv.source}, ${inv.form}, ${inv.totalAmount}, ${inv.status}, ${inv.beyondUseDate}, ${userId}, ${inv.createdAt}, ${inv.updatedAt})
      `
    }
    console.log(`Inserted ${data.inventory.length} inventory items`)
  })

// Run it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Effect.runPromise(seedData.pipe(Effect.provide(SqlLive)) as any)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seeding failed:', err)
    process.exit(1)
  })
