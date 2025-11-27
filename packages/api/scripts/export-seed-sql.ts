/**
 * Export seed data as SQL for importing to D1
 * Run: SEED_USER_ID=xxx bun run packages/api/scripts/export-seed-sql.ts > seed.sql
 * Then import to D1 via alchemy or wrangler
 */

import { generateConsistentUserData } from './seed-data.js'

const USER_ID = process.env.SEED_USER_ID || 'YOUR_USER_ID_HERE'

if (USER_ID === 'YOUR_USER_ID_HERE') {
  console.error('Set SEED_USER_ID env var to your production user ID')
  process.exit(1)
}

const escapeSQL = (str: string | null): string => {
  if (str === null) return 'NULL'
  return `'${str.replace(/'/g, "''")}'`
}

const sql: string[] = []

sql.push('-- Seed data for production')
sql.push(`-- User ID: ${USER_ID}`)
sql.push('')

// Clear existing data
sql.push(`DELETE FROM weight_logs WHERE user_id = ${escapeSQL(USER_ID)};`)
sql.push(`DELETE FROM injection_logs WHERE user_id = ${escapeSQL(USER_ID)};`)
sql.push(
  `DELETE FROM schedule_phases WHERE schedule_id IN (SELECT id FROM injection_schedules WHERE user_id = ${escapeSQL(USER_ID)});`,
)
sql.push(`DELETE FROM injection_schedules WHERE user_id = ${escapeSQL(USER_ID)};`)
sql.push(`DELETE FROM glp1_inventory WHERE user_id = ${escapeSQL(USER_ID)};`)
sql.push('')

const data = generateConsistentUserData()

// Insert schedules
for (const schedule of data.schedules) {
  sql.push(
    `INSERT INTO injection_schedules (id, name, drug, source, frequency, start_date, is_active, notes, user_id, created_at, updated_at)`,
  )
  sql.push(
    `VALUES (${escapeSQL(schedule.id)}, ${escapeSQL(schedule.name)}, ${escapeSQL(schedule.drug)}, ${escapeSQL(schedule.source)}, ${escapeSQL(schedule.frequency)}, ${escapeSQL(schedule.startDate)}, ${schedule.isActive ? 1 : 0}, ${escapeSQL(schedule.notes)}, ${escapeSQL(USER_ID)}, ${escapeSQL(schedule.createdAt)}, ${escapeSQL(schedule.updatedAt)});`,
  )
}
sql.push('')

// Insert phases
for (const phase of data.phases) {
  sql.push(`INSERT INTO schedule_phases (id, schedule_id, "order", duration_days, dosage, created_at, updated_at)`)
  sql.push(
    `VALUES (${escapeSQL(phase.id)}, ${escapeSQL(phase.scheduleId)}, ${phase.order}, ${phase.durationDays === null ? 'NULL' : phase.durationDays}, ${escapeSQL(phase.dosage)}, ${escapeSQL(phase.createdAt)}, ${escapeSQL(phase.updatedAt)});`,
  )
}
sql.push('')

// Insert injections
for (const inj of data.injections) {
  sql.push(
    `INSERT INTO injection_logs (id, datetime, drug, source, dosage, injection_site, notes, schedule_id, user_id, created_at, updated_at)`,
  )
  sql.push(
    `VALUES (${escapeSQL(inj.id)}, ${escapeSQL(inj.datetime)}, ${escapeSQL(inj.drug)}, ${escapeSQL(inj.source)}, ${escapeSQL(inj.dosage)}, ${escapeSQL(inj.injectionSite)}, ${escapeSQL(inj.notes)}, ${escapeSQL(inj.scheduleId)}, ${escapeSQL(USER_ID)}, ${escapeSQL(inj.createdAt)}, ${escapeSQL(inj.updatedAt)});`,
  )
}
sql.push('')

// Insert weights
for (const weight of data.weights) {
  sql.push(`INSERT INTO weight_logs (id, datetime, weight, unit, notes, user_id, created_at, updated_at)`)
  sql.push(
    `VALUES (${escapeSQL(weight.id)}, ${escapeSQL(weight.datetime)}, ${weight.weight}, ${escapeSQL(weight.unit)}, ${escapeSQL(weight.notes)}, ${escapeSQL(USER_ID)}, ${escapeSQL(weight.createdAt)}, ${escapeSQL(weight.updatedAt)});`,
  )
}
sql.push('')

// Insert inventory
for (const inv of data.inventory) {
  sql.push(
    `INSERT INTO glp1_inventory (id, drug, source, form, total_amount, status, beyond_use_date, user_id, created_at, updated_at)`,
  )
  sql.push(
    `VALUES (${escapeSQL(inv.id)}, ${escapeSQL(inv.drug)}, ${escapeSQL(inv.source)}, ${escapeSQL(inv.form)}, ${escapeSQL(inv.totalAmount)}, ${escapeSQL(inv.status)}, ${escapeSQL(inv.beyondUseDate)}, ${escapeSQL(USER_ID)}, ${escapeSQL(inv.createdAt)}, ${escapeSQL(inv.updatedAt)});`,
  )
}

console.log(sql.join('\n'))
