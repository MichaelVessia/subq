/**
 * Seed production D1 database
 * Run: bun run scripts/seed-prod.ts
 *
 * This script:
 * 1. Creates the demo user via better-auth API (if not exists)
 * 2. Seeds data for the demo user
 */
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { createCloudflareApi, importD1Database, listDatabases } from 'alchemy/cloudflare'

const API_URL = process.env.BETTER_AUTH_URL || 'https://api.subq.vessia.net'
const DEMO_USER = { email: 'consistent@example.com', password: 'testpassword123', name: 'Demo User' }

// Sign up a user via better-auth API, returns user ID
async function signUpUser(user: { email: string; password: string; name: string }): Promise<string | null> {
  console.log(`Creating user: ${user.email}...`)

  const response = await fetch(`${API_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password, name: user.name }),
  })

  if (!response.ok) {
    const text = await response.text()
    // User already exists is OK
    if (text.includes('already') || text.includes('exists') || response.status === 422) {
      console.log(`User ${user.email} already exists, fetching ID...`)
      return null // Will need to get ID from DB
    }
    throw new Error(`Failed to create user: ${response.status} ${text}`)
  }

  const data = await response.json()
  console.log(`Created user: ${user.email} (ID: ${data.user.id})`)
  return data.user.id
}

// Get user ID from D1 database
async function getUserIdFromDb(email: string): Promise<string> {
  const result = execSync(
    `bunx wrangler d1 execute subq-prod --remote --json --command "SELECT id FROM user WHERE email = '${email}'"`,
    { encoding: 'utf-8' },
  )
  const parsed = JSON.parse(result)
  const rows = parsed[0]?.results || []
  if (rows.length === 0) {
    throw new Error(`User ${email} not found in database`)
  }
  return rows[0].id
}

async function main() {
  const api = await createCloudflareApi({})

  // Find the prod database ID
  console.log('Finding prod database...')
  const databases = await listDatabases(api, 'subq-prod')
  if (databases.length === 0) {
    throw new Error('Database subq-prod not found. Make sure CI/CD has deployed first.')
  }
  const databaseId = databases[0].id
  console.log(`Found database: ${databaseId}`)

  // Create demo user
  let demoUserId = await signUpUser(DEMO_USER)
  if (!demoUserId) {
    demoUserId = await getUserIdFromDb(DEMO_USER.email)
  }
  console.log(`Demo user ID: ${demoUserId}`)

  // Generate and import seed data for demo user
  console.log('\nGenerating seed data for demo user...')
  execSync(
    `SEED_USER_ID=${demoUserId} SEED_USER_TYPE=consistent bun run packages/api/scripts/export-seed-sql.ts > /tmp/seed-prod.sql`,
  )

  console.log('Importing data to prod...')
  const sql = readFileSync('/tmp/seed-prod.sql', 'utf-8')
  await importD1Database(api, {
    databaseId,
    sqlData: sql,
  })

  console.log('\nSeed complete!')
  console.log(`Demo user: ${DEMO_USER.email} / ${DEMO_USER.password}`)
}

main().catch((err) => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
