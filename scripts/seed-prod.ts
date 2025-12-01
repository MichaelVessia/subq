/**
 * Seed production database on Fly.io
 * Run: bun run seed:prod
 *
 * This SSHs into the Fly machine and runs the seed script.
 * Requires: flyctl to be installed and authenticated
 */
import { execSync } from 'child_process'

console.log('Seeding production database on Fly.io...\n')

try {
  execSync('fly ssh console -C "bun run packages/api/scripts/seed.ts"', {
    stdio: 'inherit',
    cwd: process.cwd(),
  })
  console.log('\nSeed complete!')
} catch (err) {
  console.error('Seeding failed:', err)
  process.exit(1)
}
