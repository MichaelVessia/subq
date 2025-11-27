/**
 * Export seed data as SQL for importing to D1
 * Run: bun run packages/api/scripts/export-seed-sql.ts > seed.sql
 * Then import to D1 via alchemy or wrangler
 */

// Test user - you'll need to create this via sign-up first, then update the ID here
const USER_ID = process.env.SEED_USER_ID || 'YOUR_USER_ID_HERE'

if (USER_ID === 'YOUR_USER_ID_HERE') {
  console.error('Set SEED_USER_ID env var to your production user ID')
  console.error('You can find it after signing up by checking the user table')
  process.exit(1)
}

const escapeSQL = (str: string | null): string => {
  if (str === null) return 'NULL'
  return `'${str.replace(/'/g, "''")}'`
}

// Start date: 1 year ago
const startDate = new Date()
startDate.setFullYear(startDate.getFullYear() - 1)
startDate.setHours(8, 0, 0, 0)

const now = new Date().toISOString()

// Dose schedule
const getDrugAndDose = (weekNum: number): { drug: string; dose: string } | null => {
  if (weekNum <= 20) {
    const phase = Math.ceil(weekNum / 4)
    const doses = ['2.5mg', '5mg', '7.5mg', '10mg', '15mg']
    return { drug: 'Semaglutide', dose: doses[Math.min(phase - 1, 4)] ?? '15mg' }
  }
  if (weekNum <= 40) {
    const tirzWeek = weekNum - 20
    const phase = Math.ceil(tirzWeek / 4)
    const doses = ['2.5mg', '5mg', '7.5mg', '10mg', '15mg']
    return { drug: 'Tirzepatide', dose: doses[Math.min(phase - 1, 4)] ?? '15mg' }
  }
  return null
}

// Weight model
const getExpectedWeight = (dayNum: number): number => {
  const startWeight = 220
  const totalDays = 365
  const totalLoss = 55
  const progress = dayNum / totalDays
  const lossFactor = 1 - (1 - progress) ** 0.7
  const expectedLoss = totalLoss * lossFactor
  return startWeight - expectedLoss
}

const addFluctuation = (baseWeight: number, seed: number): number => {
  const fluctuation = (Math.sin(seed * 12.9898) * 43758.5453) % 1
  return baseWeight + (fluctuation - 0.5) * 4
}

const sites = ['left abdomen', 'right abdomen', 'left thigh', 'right thigh']

// Output SQL
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

// Create schedules
const semaScheduleId = crypto.randomUUID()
const semaStartDate = new Date(startDate)
sql.push(
  `INSERT INTO injection_schedules (id, name, drug, source, frequency, start_date, is_active, notes, user_id, created_at, updated_at)`,
)
sql.push(
  `VALUES (${escapeSQL(semaScheduleId)}, 'Semaglutide Titration', 'Semaglutide', NULL, 'weekly', ${escapeSQL(semaStartDate.toISOString())}, 0, 'Completed 20-week titration', ${escapeSQL(USER_ID)}, ${escapeSQL(now)}, ${escapeSQL(now)});`,
)

const semaPhases = [
  { order: 1, durationDays: 28, dosage: '2.5mg' },
  { order: 2, durationDays: 28, dosage: '5mg' },
  { order: 3, durationDays: 28, dosage: '7.5mg' },
  { order: 4, durationDays: 28, dosage: '10mg' },
  { order: 5, durationDays: 28, dosage: '15mg' },
]
for (const phase of semaPhases) {
  const phaseId = crypto.randomUUID()
  sql.push(`INSERT INTO schedule_phases (id, schedule_id, "order", duration_days, dosage, created_at, updated_at)`)
  sql.push(
    `VALUES (${escapeSQL(phaseId)}, ${escapeSQL(semaScheduleId)}, ${phase.order}, ${phase.durationDays}, ${escapeSQL(phase.dosage)}, ${escapeSQL(now)}, ${escapeSQL(now)});`,
  )
}

const tirzScheduleId = crypto.randomUUID()
const tirzStartDate = new Date(startDate)
tirzStartDate.setDate(tirzStartDate.getDate() + 20 * 7)
sql.push(
  `INSERT INTO injection_schedules (id, name, drug, source, frequency, start_date, is_active, notes, user_id, created_at, updated_at)`,
)
sql.push(
  `VALUES (${escapeSQL(tirzScheduleId)}, 'Tirzepatide Titration', 'Tirzepatide', NULL, 'weekly', ${escapeSQL(tirzStartDate.toISOString())}, 0, 'Completed - switched to Retatrutide', ${escapeSQL(USER_ID)}, ${escapeSQL(now)}, ${escapeSQL(now)});`,
)

const tirzPhases = [
  { order: 1, durationDays: 28, dosage: '2.5mg' },
  { order: 2, durationDays: 28, dosage: '5mg' },
  { order: 3, durationDays: 28, dosage: '7.5mg' },
  { order: 4, durationDays: 28, dosage: '10mg' },
  { order: 5, durationDays: 28, dosage: '15mg' },
]
for (const phase of tirzPhases) {
  const phaseId = crypto.randomUUID()
  sql.push(`INSERT INTO schedule_phases (id, schedule_id, "order", duration_days, dosage, created_at, updated_at)`)
  sql.push(
    `VALUES (${escapeSQL(phaseId)}, ${escapeSQL(tirzScheduleId)}, ${phase.order}, ${phase.durationDays}, ${escapeSQL(phase.dosage)}, ${escapeSQL(now)}, ${escapeSQL(now)});`,
  )
}

// Retatrutide schedule
const retatStartDate = new Date(startDate)
retatStartDate.setDate(retatStartDate.getDate() + 40 * 7)
const retatScheduleId = crypto.randomUUID()
sql.push(
  `INSERT INTO injection_schedules (id, name, drug, source, frequency, start_date, is_active, notes, user_id, created_at, updated_at)`,
)
sql.push(
  `VALUES (${escapeSQL(retatScheduleId)}, 'Retatrutide Maintenance', 'Retatrutide (Compounded)', 'Compounding Pharmacy', 'weekly', ${escapeSQL(retatStartDate.toISOString())}, 1, 'Active maintenance schedule', ${escapeSQL(USER_ID)}, ${escapeSQL(now)}, ${escapeSQL(now)});`,
)

const retatPhases = [
  { order: 1, durationDays: 14, dosage: '1mg' },
  { order: 2, durationDays: 14, dosage: '2mg' },
  { order: 3, durationDays: 14, dosage: '4mg' },
  { order: 4, durationDays: 14, dosage: '8mg' },
  { order: 5, durationDays: null, dosage: '12mg' },
]
for (const phase of retatPhases) {
  const phaseId = crypto.randomUUID()
  sql.push(`INSERT INTO schedule_phases (id, schedule_id, "order", duration_days, dosage, created_at, updated_at)`)
  sql.push(
    `VALUES (${escapeSQL(phaseId)}, ${escapeSQL(retatScheduleId)}, ${phase.order}, ${phase.durationDays === null ? 'NULL' : phase.durationDays}, ${escapeSQL(phase.dosage)}, ${escapeSQL(now)}, ${escapeSQL(now)});`,
  )
}

sql.push('')

// Generate injection logs
for (let week = 1; week <= 40; week++) {
  const drugDose = getDrugAndDose(week)
  if (!drugDose) continue

  const { drug, dose } = drugDose
  const injectionDate = new Date(startDate)
  injectionDate.setDate(startDate.getDate() + (week - 1) * 7)
  injectionDate.setHours(18, Math.floor(Math.random() * 30), 0, 0)

  const site = sites[(week - 1) % sites.length]
  const prevDrugDose = week > 1 ? getDrugAndDose(week - 1) : null

  let notes: string | null = null
  if (week === 1) notes = 'First injection - starting journey'
  else if (week === 21) notes = 'Switching to Tirzepatide'
  else if (prevDrugDose && dose !== prevDrugDose.dose && drug === prevDrugDose.drug) notes = `Dose increase to ${dose}`
  else if (week === 40) notes = 'Completing Tirzepatide, trying Retatrutide next'

  const scheduleId = drug === 'Semaglutide' ? semaScheduleId : tirzScheduleId
  const id = crypto.randomUUID()

  sql.push(
    `INSERT INTO injection_logs (id, datetime, drug, source, dosage, injection_site, notes, schedule_id, user_id, created_at, updated_at)`,
  )
  sql.push(
    `VALUES (${escapeSQL(id)}, ${escapeSQL(injectionDate.toISOString())}, ${escapeSQL(drug)}, 'Pharmacy', ${escapeSQL(dose)}, ${escapeSQL(site)}, ${escapeSQL(notes)}, ${escapeSQL(scheduleId)}, ${escapeSQL(USER_ID)}, ${escapeSQL(now)}, ${escapeSQL(now)});`,
  )
}

// Retatrutide injections
const retatDoses = [
  { weeks: [1, 2], dose: '1mg' },
  { weeks: [3, 4], dose: '2mg' },
  { weeks: [5, 6], dose: '4mg' },
  { weeks: [7, 8], dose: '8mg' },
  { weeks: [9, 10, 11, 12], dose: '12mg' },
]

for (const doseGroup of retatDoses) {
  for (const week of doseGroup.weeks) {
    const injDate = new Date(retatStartDate)
    injDate.setDate(retatStartDate.getDate() + (week - 1) * 7)
    injDate.setHours(9, Math.floor(Math.random() * 30), 0, 0)

    if (injDate > new Date()) continue

    const site = sites[(week - 1) % sites.length]
    let notes: string | null = null
    if (week === 1) notes = 'Starting Retatrutide - switching from Tirzepatide'
    else if (doseGroup.weeks[0] === week && week > 1) notes = `Increased to ${doseGroup.dose}`

    const id = crypto.randomUUID()
    sql.push(
      `INSERT INTO injection_logs (id, datetime, drug, source, dosage, injection_site, notes, schedule_id, user_id, created_at, updated_at)`,
    )
    sql.push(
      `VALUES (${escapeSQL(id)}, ${escapeSQL(injDate.toISOString())}, 'Retatrutide (Compounded)', 'Compounding Pharmacy', ${escapeSQL(doseGroup.dose)}, ${escapeSQL(site)}, ${escapeSQL(notes)}, ${escapeSQL(retatScheduleId)}, ${escapeSQL(USER_ID)}, ${escapeSQL(now)}, ${escapeSQL(now)});`,
    )
  }
}

sql.push('')

// Generate weight logs
const patterns: Array<{ startDay: number; endDay: number; pattern: 'daily' | 'sparse' | 'moderate' }> = [
  { startDay: 0, endDay: 14, pattern: 'daily' },
  { startDay: 15, endDay: 35, pattern: 'moderate' },
  { startDay: 36, endDay: 60, pattern: 'sparse' },
  { startDay: 61, endDay: 90, pattern: 'daily' },
  { startDay: 91, endDay: 120, pattern: 'moderate' },
  { startDay: 121, endDay: 150, pattern: 'sparse' },
  { startDay: 151, endDay: 180, pattern: 'daily' },
  { startDay: 181, endDay: 240, pattern: 'moderate' },
  { startDay: 241, endDay: 280, pattern: 'sparse' },
  { startDay: 281, endDay: 320, pattern: 'daily' },
  { startDay: 321, endDay: 365, pattern: 'moderate' },
]

const getPattern = (day: number): 'daily' | 'sparse' | 'moderate' => {
  for (const p of patterns) {
    if (day >= p.startDay && day <= p.endDay) return p.pattern
  }
  return 'moderate'
}

let hitUnder200 = false
let hitUnder180 = false
let hitUnder170 = false

for (let day = 0; day <= 365; day++) {
  const pattern = getPattern(day)

  let shouldWeigh = false
  if (pattern === 'daily') {
    shouldWeigh = true
  } else if (pattern === 'moderate') {
    shouldWeigh = day % 2 === 0 || day % 3 === 0
  } else {
    shouldWeigh = day % 7 === 0 || (day % 7 === 3 && Math.random() > 0.5)
  }

  if (shouldWeigh) {
    const weightDate = new Date(startDate)
    weightDate.setDate(startDate.getDate() + day)
    weightDate.setHours(7 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 45), 0, 0)

    const baseWeight = getExpectedWeight(day)
    const weight = Math.round(addFluctuation(baseWeight, day) * 10) / 10

    let notes: string | null = null
    if (day === 0) notes = 'Starting weight - here we go!'
    else if (day === 30) notes = '1 month milestone'
    else if (day === 90) notes = '3 months - feeling great'
    else if (day === 180) notes = '6 months - halfway there'
    else if (day === 270) notes = '9 months - so close to goal'
    else if (day === 365) notes = '1 YEAR! What a journey'
    else if (weight < 200 && !hitUnder200) {
      notes = 'Under 200 for the first time!'
      hitUnder200 = true
    } else if (weight < 180 && !hitUnder180) {
      notes = 'Under 180!'
      hitUnder180 = true
    } else if (weight < 170 && !hitUnder170) {
      notes = 'Under 170 - almost at goal'
      hitUnder170 = true
    }

    const id = crypto.randomUUID()
    sql.push(`INSERT INTO weight_logs (id, datetime, weight, unit, notes, user_id, created_at, updated_at)`)
    sql.push(
      `VALUES (${escapeSQL(id)}, ${escapeSQL(weightDate.toISOString())}, ${weight}, 'lbs', ${escapeSQL(notes)}, ${escapeSQL(USER_ID)}, ${escapeSQL(now)}, ${escapeSQL(now)});`,
    )
  }
}

console.log(sql.join('\n'))
