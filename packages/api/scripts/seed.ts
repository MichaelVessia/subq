import { SqlClient } from '@effect/sql'
import { Effect } from 'effect'
import { SqlLive } from '../src/Sql.js'

// Sample data that mimics a realistic weight loss journey with GLP-1 injections
// Starting at ~175 lbs in early October, trending down to ~155 by early November

const seedData = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  // Clear existing data
  yield* sql`TRUNCATE TABLE weight_logs CASCADE`
  yield* sql`TRUNCATE TABLE injection_logs CASCADE`

  console.log('Inserting weight logs...')

  // Weight entries - realistic progression over ~6 weeks
  const weightEntries = [
    // Week 1 - Starting weight around 175
    { datetime: '2024-10-01 08:00:00', weight: 175.2, unit: 'lbs', notes: 'Starting weight' },
    { datetime: '2024-10-03 07:30:00', weight: 174.8, unit: 'lbs', notes: null },
    { datetime: '2024-10-05 08:15:00', weight: 174.5, unit: 'lbs', notes: null },
    { datetime: '2024-10-07 07:45:00', weight: 173.9, unit: 'lbs', notes: 'First week done' },

    // Week 2
    { datetime: '2024-10-09 08:00:00', weight: 173.2, unit: 'lbs', notes: null },
    { datetime: '2024-10-11 07:30:00', weight: 172.6, unit: 'lbs', notes: null },
    { datetime: '2024-10-13 08:00:00', weight: 171.8, unit: 'lbs', notes: null },
    { datetime: '2024-10-15 07:45:00', weight: 171.0, unit: 'lbs', notes: 'Feeling great' },

    // Week 3
    { datetime: '2024-10-17 08:15:00', weight: 170.5, unit: 'lbs', notes: null },
    { datetime: '2024-10-19 07:30:00', weight: 169.8, unit: 'lbs', notes: null },
    { datetime: '2024-10-21 08:00:00', weight: 169.2, unit: 'lbs', notes: null },
    { datetime: '2024-10-23 07:45:00', weight: 168.4, unit: 'lbs', notes: '3 weeks in' },

    // Week 4
    { datetime: '2024-10-25 08:00:00', weight: 167.8, unit: 'lbs', notes: null },
    { datetime: '2024-10-27 07:30:00', weight: 167.0, unit: 'lbs', notes: null },
    { datetime: '2024-10-29 08:15:00', weight: 166.2, unit: 'lbs', notes: null },
    { datetime: '2024-10-31 07:45:00', weight: 165.5, unit: 'lbs', notes: 'Dose increase' },

    // Week 5 - Dose increased, faster loss
    { datetime: '2024-11-02 08:00:00', weight: 164.2, unit: 'lbs', notes: null },
    { datetime: '2024-11-04 07:30:00', weight: 163.0, unit: 'lbs', notes: 'New dose working' },
    { datetime: '2024-11-06 08:00:00', weight: 161.8, unit: 'lbs', notes: null },
    { datetime: '2024-11-08 07:45:00', weight: 160.5, unit: 'lbs', notes: null },

    // Week 6
    { datetime: '2024-11-10 08:15:00', weight: 159.2, unit: 'lbs', notes: null },
    { datetime: '2024-11-12 07:30:00', weight: 158.0, unit: 'lbs', notes: null },
    { datetime: '2024-11-14 08:00:00', weight: 157.0, unit: 'lbs', notes: '18+ lbs lost!' },
    { datetime: '2024-11-16 07:45:00', weight: 156.8, unit: 'lbs', notes: null },
  ]

  for (const entry of weightEntries) {
    yield* sql`
      INSERT INTO weight_logs (datetime, weight, unit, notes)
      VALUES (${entry.datetime}::timestamptz, ${entry.weight}, ${entry.unit}, ${entry.notes})
    `
  }

  console.log(`Inserted ${weightEntries.length} weight logs`)

  console.log('Inserting injection logs...')

  // Injection entries - weekly GLP-1 injections with dose titration
  const injectionEntries = [
    // 2.5mg starting dose for first 4 weeks
    {
      datetime: '2024-10-01 18:00:00',
      drug: 'Semaglutide',
      source: 'Pharmacy',
      dosage: '2.5mg',
      injectionSite: 'left abdomen',
      notes: 'First injection',
    },
    {
      datetime: '2024-10-08 18:00:00',
      drug: 'Semaglutide',
      source: 'Pharmacy',
      dosage: '2.5mg',
      injectionSite: 'right abdomen',
      notes: null,
    },
    {
      datetime: '2024-10-15 18:30:00',
      drug: 'Semaglutide',
      source: 'Pharmacy',
      dosage: '2.5mg',
      injectionSite: 'left thigh',
      notes: null,
    },
    {
      datetime: '2024-10-22 18:00:00',
      drug: 'Semaglutide',
      source: 'Pharmacy',
      dosage: '2.5mg',
      injectionSite: 'right thigh',
      notes: null,
    },

    // Dose increase to 5mg
    {
      datetime: '2024-10-29 18:00:00',
      drug: 'Semaglutide',
      source: 'Pharmacy',
      dosage: '5mg',
      injectionSite: 'left abdomen',
      notes: 'Dose increase',
    },
    {
      datetime: '2024-11-05 18:15:00',
      drug: 'Semaglutide',
      source: 'Pharmacy',
      dosage: '5mg',
      injectionSite: 'right abdomen',
      notes: null,
    },
    {
      datetime: '2024-11-12 18:00:00',
      drug: 'Semaglutide',
      source: 'Pharmacy',
      dosage: '5mg',
      injectionSite: 'left thigh',
      notes: null,
    },
  ]

  for (const entry of injectionEntries) {
    yield* sql`
      INSERT INTO injection_logs (datetime, drug, source, dosage, injection_site, notes)
      VALUES (
        ${entry.datetime}::timestamptz,
        ${entry.drug},
        ${entry.source},
        ${entry.dosage},
        ${entry.injectionSite},
        ${entry.notes}
      )
    `
  }

  console.log(`Inserted ${injectionEntries.length} injection logs`)
  console.log('\nSeed data complete!')
})

// Run it
seedData
  .pipe(Effect.provide(SqlLive))
  .pipe(Effect.runPromise)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seeding failed:', err)
    process.exit(1)
  })
