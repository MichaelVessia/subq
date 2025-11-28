/**
 * Seed production D1 database
 * Run: bun run scripts/seed-prod.ts
 *
 * This script imports seed data for demo user and creates e2e test user
 */
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { createCloudflareApi, importD1Database } from 'alchemy/cloudflare'

// Prod demo user ID (from `SELECT id FROM user` in subq-prod)
const PROD_USER_ID = 'ixS152zRzuAkO1x4p3wDICd2dKjT3QMg'

// Prod database ID (subq-prod)
const DATABASE_ID = 'bec16be3-fa6a-4121-a34a-d273a644519e'

const api = await createCloudflareApi({})

console.log('Generating seed data for demo user...')
execSync(
  `SEED_USER_ID=${PROD_USER_ID} SEED_USER_TYPE=consistent bun run packages/api/scripts/export-seed-sql.ts > /tmp/seed-prod.sql`,
)

console.log('Importing data to prod...')
const sql = readFileSync('/tmp/seed-prod.sql', 'utf-8')
await importD1Database(api, {
  databaseId: DATABASE_ID,
  sqlData: sql,
})

console.log('Seed complete!')
console.log('')
console.log('NOTE: E2E test user (e2e@test.subq.vessia.net) must be created manually via the app.')
console.log('This user is used by CI for e2e tests and should have no seeded data.')
