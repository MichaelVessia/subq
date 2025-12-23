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
  // Get machine ID for non-interactive environments (CI/CD)
  const machineId = execSync('fly machines list -q --json', { encoding: 'utf-8' })
  const machines = JSON.parse(machineId)
  const machine = machines.find((m: { state: string }) => m.state === 'started') || machines[0]

  if (!machine) {
    throw new Error('No machines found for app')
  }

  // Start machine if stopped
  if (machine.state === 'stopped') {
    console.log(`Starting machine ${machine.id}...`)
    execSync(`fly machine start ${machine.id}`, { stdio: 'inherit' })
    // Wait for machine to be ready
    execSync(`fly machine wait ${machine.id}`, { stdio: 'inherit' })
  }

  execSync(`fly ssh console --machine ${machine.id} -C "bun run packages/api/scripts/seed.ts"`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  })
  console.log('\nSeed complete!')
} catch (err) {
  console.error('Seeding failed:', err)
  process.exit(1)
}
