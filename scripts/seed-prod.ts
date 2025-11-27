/**
 * Seed production D1 database
 * Run: bun run scripts/seed-prod.ts
 * 
 * This script imports seed data directly without going through alchemy resource management
 */
import { readFileSync } from 'fs'
import { execSync } from 'child_process'
import { importD1Database, createCloudflareApi } from 'alchemy/cloudflare'

const USER_IDS = {
  consistent: 'gEzIVhJ4Yma6S8mbaMHr3ELIMaZ1q2gy',
  sparse: 'IA38VFElFnyrRIoXbG93GG3seHiL1ra6',
}

// Database ID from alchemy state (run `bun run alchemy.run.ts` to see it)
const DATABASE_ID = 'b0b8d095-f9b1-4ec3-a79f-f8a7de38291e'

// Generate and import seed SQL for consistent user
console.log('Generating seed data for consistent user...')
execSync(`SEED_USER_ID=${USER_IDS.consistent} bun run packages/api/scripts/export-seed-sql.ts > /tmp/seed-consistent.sql`)

console.log('Importing seed data...')
const sqlData = readFileSync('/tmp/seed-consistent.sql', 'utf-8')

const api = await createCloudflareApi({})
await importD1Database(api, {
  databaseId: DATABASE_ID,
  sqlData,
})

console.log('Seed complete!')
