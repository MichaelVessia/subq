/**
 * Seed production D1 database
 * Run: bun run scripts/seed-prod.ts
 *
 * This script imports seed data for both test users
 */
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { createCloudflareApi, importD1Database } from 'alchemy/cloudflare'

const USER_IDS = {
  consistent: 'gEzIVhJ4Yma6S8mbaMHr3ELIMaZ1q2gy',
  sparse: 'IA38VFElFnyrRIoXbG93GG3seHiL1ra6',
}

// Database ID from alchemy state (run `bun run alchemy.run.ts` to see it)
const DATABASE_ID = 'b0b8d095-f9b1-4ec3-a79f-f8a7de38291e'

const api = await createCloudflareApi({})

// Seed consistent user
console.log('Generating seed data for consistent user...')
execSync(
  `SEED_USER_ID=${USER_IDS.consistent} SEED_USER_TYPE=consistent bun run packages/api/scripts/export-seed-sql.ts > /tmp/seed-consistent.sql`,
)

console.log('Importing consistent user data...')
const consistentSql = readFileSync('/tmp/seed-consistent.sql', 'utf-8')
await importD1Database(api, {
  databaseId: DATABASE_ID,
  sqlData: consistentSql,
})
console.log('Consistent user seeded!')

// Seed sparse user
console.log('\nGenerating seed data for sparse user...')
execSync(
  `SEED_USER_ID=${USER_IDS.sparse} SEED_USER_TYPE=sparse bun run packages/api/scripts/export-seed-sql.ts > /tmp/seed-sparse.sql`,
)

console.log('Importing sparse user data...')
const sparseSql = readFileSync('/tmp/seed-sparse.sql', 'utf-8')
await importD1Database(api, {
  databaseId: DATABASE_ID,
  sqlData: sparseSql,
})
console.log('Sparse user seeded!')

console.log('\nSeed complete for both users!')
