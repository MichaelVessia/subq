import { SqlClient } from '@effect/sql'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db'
import { Config, Effect } from 'effect'
import { Pool } from 'pg'
import { SqlLive } from '../src/Sql.js'

// Test user credentials
const TEST_USERS = [
  { email: 'consistent@example.com', password: 'testpassword123', name: 'Consistent User' },
  { email: 'sparse@example.com', password: 'testpassword123', name: 'Sparse User' },
]

// 1 year of realistic GLP-1 weight loss journey
// - Weekly injections ramping from 2.5mg to 15mg
// - Variable weighing frequency (daily streaks, sparse periods)
// - Starting ~220 lbs, ending ~165 lbs

// Helper to create or get a user
const getOrCreateUser = (
  sql: SqlClient.SqlClient,
  auth: ReturnType<typeof betterAuth>,
  email: string,
  password: string,
  name: string,
) =>
  Effect.gen(function* () {
    // Check if user exists first
    const existingUser = yield* sql`SELECT id FROM "user" WHERE email = ${email}`
    if (existingUser.length > 0) {
      const userId = existingUser[0].id as string
      console.log(`Using existing user: ${email} (ID: ${userId})`)
      return userId
    }

    // Create new user
    const signUpResult = yield* Effect.tryPromise(() =>
      auth.api.signUpEmail({
        body: { email, password, name },
      }),
    )
    console.log(`Created user: ${email} (ID: ${signUpResult.user.id})`)
    return signUpResult.user.id
  })

const seedData = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const databaseUrl = yield* Config.string('DATABASE_URL')
  const authSecret = yield* Config.string('BETTER_AUTH_SECRET')
  const authUrl = yield* Config.string('BETTER_AUTH_URL')

  // Create better-auth instance to manage test user
  const pool = new Pool({ connectionString: databaseUrl })
  const authOptions = {
    database: pool,
    secret: authSecret,
    baseURL: authUrl,
    emailAndPassword: {
      enabled: true,
    },
  }

  // Run better-auth migrations first
  console.log('Running better-auth migrations...')
  const { runMigrations } = yield* Effect.promise(() => getMigrations(authOptions))
  yield* Effect.promise(runMigrations)

  const auth = betterAuth(authOptions)

  // Create users
  console.log('Setting up test users...')
  const userIds: string[] = []
  for (const user of TEST_USERS) {
    const userId = yield* getOrCreateUser(sql, auth, user.email, user.password, user.name)
    userIds.push(userId)
  }

  // Seed data for first user (consistent data)
  yield* seedConsistentUser(sql, userIds[0])

  // Seed data for second user (sparse/irregular data)
  yield* seedSparseUser(sql, userIds[1])

  console.log('\nSeed data complete!')
  console.log(`\nTest user credentials:`)
  for (const user of TEST_USERS) {
    console.log(`  ${user.name}: ${user.email} / ${user.password}`)
  }

  // Clean up the pool
  yield* Effect.promise(() => pool.end())
})

// Seed consistent user (original behavior)
const seedConsistentUser = (sql: SqlClient.SqlClient, userId: string) =>
  Effect.gen(function* () {
    // Clear existing data for this user
    yield* sql`DELETE FROM weight_logs WHERE user_id = ${userId}`
    yield* sql`DELETE FROM injection_logs WHERE user_id = ${userId}`

    console.log(`\nGenerating 1 year of consistent data for user ${userId}...`)

    // Start date: 1 year ago
    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - 1)
    startDate.setHours(8, 0, 0, 0)

    // Dose schedule:
    // Weeks 1-26: Semaglutide - increase 2.5mg each week until 15mg
    // Weeks 27-52: Switch to Tirzepatide - start at 2.5mg, ramp to 15mg
    const getDrugAndDose = (weekNum: number): { drug: string; dose: string } => {
      if (weekNum <= 26) {
        // Semaglutide phase
        const dose = Math.min(weekNum * 2.5, 15)
        return { drug: 'Semaglutide', dose: `${dose}mg` }
      }
      // Tirzepatide phase - restart dosing from 2.5mg
      const tirzWeek = weekNum - 26
      const dose = Math.min(tirzWeek * 2.5, 15)
      return { drug: 'Tirzepatide', dose: `${dose}mg` }
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

      const { drug, dose } = getDrugAndDose(week)
      const site = sites[(week - 1) % sites.length]
      const prevDrugDose = week > 1 ? getDrugAndDose(week - 1) : null

      let notes: string | null = null
      if (week === 1) notes = 'First injection - starting journey'
      else if (week === 27) notes = 'Switching to Tirzepatide'
      else if (prevDrugDose && dose !== prevDrugDose.dose && drug === prevDrugDose.drug)
        notes = `Dose increase to ${dose}`
      else if (week === 52) notes = '1 year milestone!'
      else if (week % 12 === 0) notes = `${week} weeks in`

      injectionEntries.push({
        datetime: injectionDate.toISOString(),
        drug,
        source: 'Pharmacy',
        dosage: dose,
        injectionSite: site,
        notes,
      })
    }

    for (const entry of injectionEntries) {
      yield* sql`
      INSERT INTO injection_logs (datetime, drug, source, dosage, injection_site, notes, user_id)
      VALUES (
        ${entry.datetime}::timestamptz,
        ${entry.drug},
        ${entry.source},
        ${entry.dosage},
        ${entry.injectionSite},
        ${entry.notes},
        ${userId}
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
      INSERT INTO weight_logs (datetime, weight, unit, notes, user_id)
      VALUES (${entry.datetime}::timestamptz, ${entry.weight}, ${entry.unit}, ${entry.notes}, ${userId})
    `
    }

    console.log(`Inserted ${weightEntries.length} weight logs`)
  })

// Seed sparse user - irregular tracking with gaps, dose changes back and forth
const seedSparseUser = (sql: SqlClient.SqlClient, userId: string) =>
  Effect.gen(function* () {
    // Clear existing data for this user
    yield* sql`DELETE FROM weight_logs WHERE user_id = ${userId}`
    yield* sql`DELETE FROM injection_logs WHERE user_id = ${userId}`

    console.log(`\nGenerating sparse/irregular data for user ${userId}...`)

    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - 1)
    startDate.setHours(8, 0, 0, 0)

    const sites = ['left abdomen', 'right abdomen', 'left thigh', 'right thigh']

    // Sparse user pattern:
    // - Starts strong for 6 weeks, then stops for 4 weeks
    // - Restarts at lower dose, builds up, then has supply issues
    // - Switches between Semaglutide and Tirzepatide
    // - Goes back and forth on dosing
    // - Weighs very inconsistently - sometimes daily for a week, then nothing for 3 weeks
    type Phase = {
      startWeek: number
      endWeek: number
      active: boolean
      drug: string
      dose: string
      notes?: string
    }
    const phases: Phase[] = [
      { startWeek: 1, endWeek: 6, active: true, drug: 'Semaglutide', dose: '2.5mg', notes: 'Starting out' },
      { startWeek: 7, endWeek: 10, active: false, drug: '', dose: '0mg', notes: 'Stopped - side effects' },
      { startWeek: 11, endWeek: 14, active: true, drug: 'Semaglutide', dose: '2.5mg', notes: 'Restarting slow' },
      { startWeek: 15, endWeek: 18, active: true, drug: 'Semaglutide', dose: '5mg' },
      { startWeek: 19, endWeek: 22, active: true, drug: 'Semaglutide', dose: '7.5mg' },
      { startWeek: 23, endWeek: 26, active: false, drug: '', dose: '0mg', notes: 'Supply issues' },
      {
        startWeek: 27,
        endWeek: 30,
        active: true,
        drug: 'Tirzepatide',
        dose: '2.5mg',
        notes: 'Switching to Tirzepatide',
      },
      { startWeek: 31, endWeek: 34, active: true, drug: 'Tirzepatide', dose: '5mg' },
      { startWeek: 35, endWeek: 38, active: true, drug: 'Tirzepatide', dose: '7.5mg' },
      { startWeek: 39, endWeek: 42, active: false, drug: '', dose: '0mg', notes: 'Took a break' },
      { startWeek: 43, endWeek: 46, active: true, drug: 'Semaglutide', dose: '5mg', notes: 'Back to Semaglutide' },
      { startWeek: 47, endWeek: 52, active: true, drug: 'Semaglutide', dose: '7.5mg' },
    ]

    // Generate injection logs based on phases
    const injectionEntries: Array<{
      datetime: string
      drug: string
      source: string
      dosage: string
      injectionSite: string
      notes: string | null
    }> = []

    for (const phase of phases) {
      if (!phase.active) continue
      for (let week = phase.startWeek; week <= phase.endWeek; week++) {
        // Sometimes miss a week (20% chance)
        if (Math.random() < 0.2) continue

        const injectionDate = new Date(startDate)
        // Add random day offset (-2 to +3 days) for inconsistent injection day
        const dayOffset = Math.floor(Math.random() * 6) - 2
        injectionDate.setDate(startDate.getDate() + (week - 1) * 7 + dayOffset)
        // Inconsistent timing - anywhere from morning to night
        injectionDate.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0)

        const site = sites[Math.floor(Math.random() * sites.length)]

        let notes: string | null = null
        if (week === phase.startWeek && phase.notes) {
          notes = phase.notes
        } else if (Math.random() < 0.1) {
          const randomNotes = ['Forgot yesterday, taking today', 'Slight bruising', 'Easy injection', 'Running low']
          notes = randomNotes[Math.floor(Math.random() * randomNotes.length)]
        }

        injectionEntries.push({
          datetime: injectionDate.toISOString(),
          drug: phase.drug,
          source: Math.random() > 0.3 ? 'Pharmacy' : 'Compounding pharmacy',
          dosage: phase.dose,
          injectionSite: site,
          notes,
        })
      }
    }

    for (const entry of injectionEntries) {
      yield* sql`
        INSERT INTO injection_logs (datetime, drug, source, dosage, injection_site, notes, user_id)
        VALUES (
          ${entry.datetime}::timestamptz,
          ${entry.drug},
          ${entry.source},
          ${entry.dosage},
          ${entry.injectionSite},
          ${entry.notes},
          ${userId}
        )
      `
    }
    console.log(`Inserted ${injectionEntries.length} injection logs`)

    // Weight entries - very sparse and inconsistent
    // Starting weight ~240, minimal progress due to inconsistent treatment
    // Maybe ends around 215-220 (modest loss)
    const weightEntries: Array<{
      datetime: string
      weight: number
      unit: string
      notes: string | null
    }> = []

    // Define sparse weighing periods
    type WeighPeriod = {
      startDay: number
      endDay: number
      frequency: 'daily' | 'weekly' | 'biweekly' | 'none'
    }
    const weighPeriods: WeighPeriod[] = [
      { startDay: 0, endDay: 7, frequency: 'daily' }, // First week - motivated
      { startDay: 8, endDay: 21, frequency: 'none' }, // Forgot about it
      { startDay: 22, endDay: 35, frequency: 'weekly' }, // Occasional check-in
      { startDay: 36, endDay: 70, frequency: 'none' }, // Stopped caring (during break)
      { startDay: 71, endDay: 85, frequency: 'daily' }, // Restarted, checking daily
      { startDay: 86, endDay: 140, frequency: 'biweekly' }, // Occasional
      { startDay: 141, endDay: 180, frequency: 'none' }, // Supply issues period
      { startDay: 181, endDay: 195, frequency: 'daily' }, // Back on track
      { startDay: 196, endDay: 250, frequency: 'weekly' },
      { startDay: 251, endDay: 280, frequency: 'none' }, // Break period
      { startDay: 281, endDay: 300, frequency: 'daily' }, // Restarting
      { startDay: 301, endDay: 365, frequency: 'biweekly' },
    ]

    const getWeighFrequency = (day: number): 'daily' | 'weekly' | 'biweekly' | 'none' => {
      for (const period of weighPeriods) {
        if (day >= period.startDay && day <= period.endDay) return period.frequency
      }
      return 'none'
    }

    // Weight model for sparse user - less consistent loss
    // Start: 240, End: ~220 (only ~20 lb loss due to inconsistency)
    const getSparseUserWeight = (dayNum: number): number => {
      const startWeight = 240
      // Modest, inconsistent loss
      const progress = dayNum / 365
      // Weight fluctuates more, trends down slowly
      const baseLoss = 20 * progress
      // Add larger fluctuations (+/- 5 lbs)
      const fluctuation = Math.sin(dayNum * 0.3) * 3 + Math.cos(dayNum * 0.7) * 2
      return startWeight - baseLoss + fluctuation
    }

    let day = 0
    while (day <= 365) {
      const freq = getWeighFrequency(day)

      let shouldWeigh = false
      if (freq === 'daily') {
        shouldWeigh = true
      } else if (freq === 'weekly') {
        shouldWeigh = day % 7 === 0
      } else if (freq === 'biweekly') {
        shouldWeigh = day % 14 === 0
      }

      if (shouldWeigh) {
        const weightDate = new Date(startDate)
        weightDate.setDate(startDate.getDate() + day)
        // Random time of day
        weightDate.setHours(6 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60), 0, 0)

        const weight = Math.round(getSparseUserWeight(day) * 10) / 10

        let notes: string | null = null
        if (day === 0) notes = 'Starting weight'
        else if (Math.random() < 0.15) {
          const randomNotes = [
            'After big meal',
            'Morning weight',
            'Before bed',
            'Dehydrated probably',
            'Feeling bloated',
          ]
          notes = randomNotes[Math.floor(Math.random() * randomNotes.length)]
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
        INSERT INTO weight_logs (datetime, weight, unit, notes, user_id)
        VALUES (${entry.datetime}::timestamptz, ${entry.weight}, ${entry.unit}, ${entry.notes}, ${userId})
      `
    }

    console.log(`Inserted ${weightEntries.length} weight logs`)
  })

// Run it
Effect.runPromise(seedData.pipe(Effect.provide(SqlLive)))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seeding failed:', err)
    process.exit(1)
  })
