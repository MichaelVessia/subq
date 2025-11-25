import { SqlClient } from '@effect/sql'
import { Effect } from 'effect'
import { SqlLive } from '../src/Sql.js'

// 1 year of realistic GLP-1 weight loss journey
// - Weekly injections ramping from 2.5mg to 15mg
// - Variable weighing frequency (daily streaks, sparse periods)
// - Starting ~220 lbs, ending ~165 lbs

const seedData = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  // Clear existing data
  yield* sql`TRUNCATE TABLE weight_logs CASCADE`
  yield* sql`TRUNCATE TABLE injection_logs CASCADE`

  console.log('Generating 1 year of data...')

  // Start date: 1 year ago
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 1)
  startDate.setHours(8, 0, 0, 0)

  // Dose schedule: increase 2.5mg each week until 15mg, then maintain
  // Week 1: 2.5mg, Week 2: 5mg, Week 3: 7.5mg, Week 4: 10mg, Week 5: 12.5mg, Week 6+: 15mg
  const getDose = (weekNum: number): string => {
    const dose = Math.min(weekNum * 2.5, 15)
    return `${dose}mg`
  }

  // Weight loss model
  // Start: 220 lbs
  // More aggressive loss during titration, slower at maintenance
  // Target ~165 lbs by end (55 lb loss)
  const getExpectedWeight = (dayNum: number): number => {
    const startWeight = 220
    const totalDays = 365
    const totalLoss = 55

    // Non-linear loss curve - faster at start, slower over time
    const progress = dayNum / totalDays
    const lossFactor = 1 - (1 - progress) ** 0.7 // Diminishing returns curve
    const expectedLoss = totalLoss * lossFactor

    return startWeight - expectedLoss
  }

  // Add daily fluctuation (-2 to +2 lbs)
  const addFluctuation = (baseWeight: number, seed: number): number => {
    const fluctuation = (Math.sin(seed * 12.9898) * 43758.5453) % 1
    return baseWeight + (fluctuation - 0.5) * 4
  }

  // Injection sites rotation
  const sites = ['left abdomen', 'right abdomen', 'left thigh', 'right thigh']

  // Generate injection logs (weekly for 52 weeks)
  console.log('Inserting injection logs...')
  const injectionEntries: Array<{
    datetime: string
    drug: string
    source: string
    dosage: string
    injectionSite: string
    notes: string | null
  }> = []

  for (let week = 1; week <= 52; week++) {
    const injectionDate = new Date(startDate)
    injectionDate.setDate(startDate.getDate() + (week - 1) * 7)
    injectionDate.setHours(18, Math.floor(Math.random() * 30), 0, 0) // Evening, slight variation

    const dose = getDose(week)
    const site = sites[(week - 1) % sites.length]
    const prevDose = week > 1 ? getDose(week - 1) : null

    let notes: string | null = null
    if (week === 1) notes = 'First injection - starting journey'
    else if (dose !== prevDose) notes = `Dose increase to ${dose}`
    else if (week === 52) notes = '1 year milestone!'
    else if (week % 12 === 0) notes = `${week} weeks in`

    injectionEntries.push({
      datetime: injectionDate.toISOString(),
      drug: 'Semaglutide',
      source: 'Pharmacy',
      dosage: dose,
      injectionSite: site,
      notes,
    })
  }

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

  // Generate weight logs with variable frequency
  // Pattern: alternating between daily streaks and sparse periods
  console.log('Inserting weight logs...')
  const weightEntries: Array<{
    datetime: string
    weight: number
    unit: string
    notes: string | null
  }> = []

  // Define weighing patterns for different periods
  // Each period: { startDay, endDay, pattern: 'daily' | 'sparse' | 'moderate' }
  const patterns: Array<{ startDay: number; endDay: number; pattern: 'daily' | 'sparse' | 'moderate' }> = [
    { startDay: 0, endDay: 14, pattern: 'daily' }, // First 2 weeks - excited, daily
    { startDay: 15, endDay: 35, pattern: 'moderate' }, // Weeks 3-5 - every 2-3 days
    { startDay: 36, endDay: 60, pattern: 'sparse' }, // Weeks 6-8 - got lazy, 1-2x/week
    { startDay: 61, endDay: 90, pattern: 'daily' }, // Weeks 9-13 - new dose, tracking closely
    { startDay: 91, endDay: 120, pattern: 'moderate' }, // Weeks 14-17
    { startDay: 121, endDay: 150, pattern: 'sparse' }, // Weeks 18-21 - holidays, sparse
    { startDay: 151, endDay: 180, pattern: 'daily' }, // Weeks 22-26 - new year resolution
    { startDay: 181, endDay: 240, pattern: 'moderate' }, // Weeks 27-34
    { startDay: 241, endDay: 280, pattern: 'sparse' }, // Weeks 35-40
    { startDay: 281, endDay: 320, pattern: 'daily' }, // Weeks 41-46 - motivated again
    { startDay: 321, endDay: 365, pattern: 'moderate' }, // Weeks 47-52
  ]

  const getPattern = (day: number): 'daily' | 'sparse' | 'moderate' => {
    for (const p of patterns) {
      if (day >= p.startDay && day <= p.endDay) return p.pattern
    }
    return 'moderate'
  }

  let day = 0
  let hitUnder200 = false
  let hitUnder180 = false
  let hitUnder170 = false
  while (day <= 365) {
    const pattern = getPattern(day)

    // Determine if we weigh today
    let shouldWeigh = false
    if (pattern === 'daily') {
      shouldWeigh = true
    } else if (pattern === 'moderate') {
      // Every 2-3 days
      shouldWeigh = day % 2 === 0 || day % 3 === 0
    } else {
      // Sparse: 1-2x per week
      shouldWeigh = day % 7 === 0 || (day % 7 === 3 && Math.random() > 0.5)
    }

    if (shouldWeigh) {
      const weightDate = new Date(startDate)
      weightDate.setDate(startDate.getDate() + day)
      // Morning weigh-in with slight time variation
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
      // Check for milestone crossings (only trigger once using min weight seen)
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

      weightEntries.push({
        datetime: weightDate.toISOString(),
        weight,
        unit: 'lbs',
        notes,
      })
    }

    day++
  }

  for (const entry of weightEntries) {
    yield* sql`
      INSERT INTO weight_logs (datetime, weight, unit, notes)
      VALUES (${entry.datetime}::timestamptz, ${entry.weight}, ${entry.unit}, ${entry.notes})
    `
  }

  console.log(`Inserted ${weightEntries.length} weight logs`)
  console.log('\nSeed data complete!')
  console.log(`Date range: ${startDate.toLocaleDateString()} to ${new Date().toLocaleDateString()}`)
})

// Run it
Effect.runPromise(seedData.pipe(Effect.provide(SqlLive)))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seeding failed:', err)
    process.exit(1)
  })
