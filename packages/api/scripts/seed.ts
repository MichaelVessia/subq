import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { SqlClient } from '@effect/sql'
import { Database } from 'bun:sqlite'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db'
import { Config, Effect } from 'effect'
import { SqlLive } from '../src/Sql.js'

// Test user credentials
const TEST_USERS = [
  { email: 'consistent@example.com', password: 'testpassword123', name: 'Consistent User' },
  { email: 'sparse@example.com', password: 'testpassword123', name: 'Sparse User' },
]

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
    const existingUser = yield* sql`SELECT id FROM user WHERE email = ${email}`
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
  const databasePath = yield* Config.string('DATABASE_PATH').pipe(Config.withDefault('./data/scalability.db'))
  const authSecret = yield* Config.string('BETTER_AUTH_SECRET')
  const authUrl = yield* Config.string('BETTER_AUTH_URL')

  // Ensure data directory exists
  yield* Effect.tryPromise(() => mkdir(dirname(databasePath), { recursive: true }))

  // Create better-auth instance with better-sqlite3 for auth migrations
  const sqlite = new Database(databasePath)
  const authOptions = {
    database: sqlite,
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

  // Clean up the sqlite connection
  sqlite.close()
})

// Seed consistent user (original behavior)
const seedConsistentUser = (sql: SqlClient.SqlClient, userId: string) =>
  Effect.gen(function* () {
    // Clear existing data for this user
    yield* sql`DELETE FROM weight_logs WHERE user_id = ${userId}`
    yield* sql`DELETE FROM injection_logs WHERE user_id = ${userId}`
    yield* sql`DELETE FROM schedule_phases WHERE schedule_id IN (SELECT id FROM injection_schedules WHERE user_id = ${userId})`
    yield* sql`DELETE FROM injection_schedules WHERE user_id = ${userId}`

    console.log(`\nGenerating 1 year of consistent data for user ${userId}...`)

    // Start date: 1 year ago
    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - 1)
    startDate.setHours(8, 0, 0, 0)

    // Dose schedule - Semaglutide weeks 1-20, Tirzepatide weeks 21-40, then Retatrutide (unlinked)
    const getDrugAndDose = (weekNum: number): { drug: string; dose: string } | null => {
      if (weekNum <= 20) {
        // Semaglutide: 2.5mg weeks 1-4, 5mg weeks 5-8, 7.5mg weeks 9-12, 10mg weeks 13-16, 15mg weeks 17-20
        const phase = Math.ceil(weekNum / 4)
        const doses = ['2.5mg', '5mg', '7.5mg', '10mg', '15mg']
        return { drug: 'Semaglutide', dose: doses[Math.min(phase - 1, 4)] ?? '15mg' }
      }
      if (weekNum <= 40) {
        // Tirzepatide: same pattern
        const tirzWeek = weekNum - 20
        const phase = Math.ceil(tirzWeek / 4)
        const doses = ['2.5mg', '5mg', '7.5mg', '10mg', '15mg']
        return { drug: 'Tirzepatide', dose: doses[Math.min(phase - 1, 4)] ?? '15mg' }
      }
      return null // Weeks 41+ handled by Retatrutide (unlinked)
    }

    // Weight loss model
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

    // Injection sites rotation
    const sites = ['left abdomen', 'right abdomen', 'left thigh', 'right thigh']

    // Generate injection logs
    console.log('Inserting injection logs...')
    const injectionEntries: Array<{
      id: string
      datetime: string
      drug: string
      source: string
      dosage: string
      injectionSite: string
      notes: string | null
      createdAt: string
      updatedAt: string
    }> = []

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
      else if (prevDrugDose && dose !== prevDrugDose.dose && drug === prevDrugDose.drug)
        notes = `Dose increase to ${dose}`
      else if (week === 40) notes = 'Completing Tirzepatide, trying Retatrutide next'

      const now = new Date().toISOString()
      injectionEntries.push({
        id: crypto.randomUUID(),
        datetime: injectionDate.toISOString(),
        drug,
        source: 'Pharmacy',
        dosage: dose,
        injectionSite: site,
        notes,
        createdAt: now,
        updatedAt: now,
      })
    }

    // Create schedules for Semaglutide and Tirzepatide
    const now = new Date().toISOString()

    // Semaglutide schedule (weeks 1-20) - completed
    const semaScheduleId = crypto.randomUUID()
    const semaStartDate = new Date(startDate)
    yield* sql`
      INSERT INTO injection_schedules (id, name, drug, source, frequency, start_date, is_active, notes, user_id, created_at, updated_at)
      VALUES (${semaScheduleId}, ${'Semaglutide Titration'}, ${'Semaglutide'}, ${null}, ${'weekly'}, ${semaStartDate.toISOString()}, ${0}, ${'Completed 20-week titration'}, ${userId}, ${now}, ${now})
    `

    // Semaglutide phases: 4 weeks each dose level
    const semaPhases = [
      { order: 1, durationDays: 28, dosage: '2.5mg' }, // weeks 1-4
      { order: 2, durationDays: 28, dosage: '5mg' }, // weeks 5-8
      { order: 3, durationDays: 28, dosage: '7.5mg' }, // weeks 9-12
      { order: 4, durationDays: 28, dosage: '10mg' }, // weeks 13-16
      { order: 5, durationDays: 28, dosage: '15mg' }, // weeks 17-20
    ]
    for (const phase of semaPhases) {
      const phaseId = crypto.randomUUID()
      yield* sql`
        INSERT INTO schedule_phases (id, schedule_id, "order", duration_days, dosage, created_at, updated_at)
        VALUES (${phaseId}, ${semaScheduleId}, ${phase.order}, ${phase.durationDays}, ${phase.dosage}, ${now}, ${now})
      `
    }

    // Tirzepatide schedule (weeks 21-40) - completed (user moved on to Retatrutide)
    const tirzScheduleId = crypto.randomUUID()
    const tirzStartDate = new Date(startDate)
    tirzStartDate.setDate(tirzStartDate.getDate() + 20 * 7) // Start at week 21
    yield* sql`
      INSERT INTO injection_schedules (id, name, drug, source, frequency, start_date, is_active, notes, user_id, created_at, updated_at)
      VALUES (${tirzScheduleId}, ${'Tirzepatide Titration'}, ${'Tirzepatide'}, ${null}, ${'weekly'}, ${tirzStartDate.toISOString()}, ${0}, ${'Completed - switched to Retatrutide'}, ${userId}, ${now}, ${now})
    `

    // Tirzepatide phases: 4 weeks each dose level
    const tirzPhases = [
      { order: 1, durationDays: 28, dosage: '2.5mg' }, // weeks 21-24
      { order: 2, durationDays: 28, dosage: '5mg' }, // weeks 25-28
      { order: 3, durationDays: 28, dosage: '7.5mg' }, // weeks 29-32
      { order: 4, durationDays: 28, dosage: '10mg' }, // weeks 33-36
      { order: 5, durationDays: 28, dosage: '15mg' }, // weeks 37-40
    ]
    for (const phase of tirzPhases) {
      const phaseId = crypto.randomUUID()
      yield* sql`
        INSERT INTO schedule_phases (id, schedule_id, "order", duration_days, dosage, created_at, updated_at)
        VALUES (${phaseId}, ${tirzScheduleId}, ${phase.order}, ${phase.durationDays}, ${phase.dosage}, ${now}, ${now})
      `
    }

    console.log('Created 2 schedules with phases')

    // Insert injections with schedule_id linked
    for (const entry of injectionEntries) {
      // Link to appropriate schedule based on drug
      const scheduleId = entry.drug === 'Semaglutide' ? semaScheduleId : tirzScheduleId
      yield* sql`
        INSERT INTO injection_logs (id, datetime, drug, source, dosage, injection_site, notes, schedule_id, user_id, created_at, updated_at)
        VALUES (${entry.id}, ${entry.datetime}, ${entry.drug}, ${entry.source}, ${entry.dosage}, ${entry.injectionSite}, ${entry.notes}, ${scheduleId}, ${userId}, ${entry.createdAt}, ${entry.updatedAt})
      `
    }
    console.log(`Inserted ${injectionEntries.length} injection logs (linked to schedules)`)

    // Generate weight logs
    console.log('Inserting weight logs...')
    const weightEntries: Array<{
      id: string
      datetime: string
      weight: number
      unit: string
      notes: string | null
      createdAt: string
      updatedAt: string
    }> = []

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

    let day = 0
    let hitUnder200 = false
    let hitUnder180 = false
    let hitUnder170 = false
    while (day <= 365) {
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

        const now = new Date().toISOString()
        weightEntries.push({
          id: crypto.randomUUID(),
          datetime: weightDate.toISOString(),
          weight,
          unit: 'lbs',
          notes,
          createdAt: now,
          updatedAt: now,
        })
      }

      day++
    }

    for (const entry of weightEntries) {
      yield* sql`
        INSERT INTO weight_logs (id, datetime, weight, unit, notes, user_id, created_at, updated_at)
        VALUES (${entry.id}, ${entry.datetime}, ${entry.weight}, ${entry.unit}, ${entry.notes}, ${userId}, ${entry.createdAt}, ${entry.updatedAt})
      `
    }

    console.log(`Inserted ${weightEntries.length} weight logs`)

    // Add UNLINKED injections for a different drug (Retatrutide) to test bulk linking
    // These start AFTER the Tirzepatide schedule ends (which was weeks 27-52, so after week 52)
    console.log('Adding unlinked Retatrutide injections for bulk link testing...')
    const retatrutideEntries: Array<{
      id: string
      datetime: string
      drug: string
      source: string
      dosage: string
      injectionSite: string
      notes: string | null
      createdAt: string
      updatedAt: string
    }> = []

    // Simulate 12 weeks of Retatrutide titration starting after week 40
    // This represents switching to a new drug after completing the Tirzepatide schedule
    const retatStartDate = new Date(startDate)
    retatStartDate.setDate(retatStartDate.getDate() + 40 * 7) // Start after week 40

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

        // Only add if the date is in the past
        if (injDate > new Date()) continue

        const site = sites[(week - 1) % sites.length]
        let notes: string | null = null
        if (week === 1) notes = 'Starting Retatrutide - switching from Tirzepatide'
        else if (doseGroup.weeks[0] === week && week > 1) notes = `Increased to ${doseGroup.dose}`

        const now = new Date().toISOString()
        retatrutideEntries.push({
          id: crypto.randomUUID(),
          datetime: injDate.toISOString(),
          drug: 'Retatrutide (Compounded)',
          source: 'Compounding Pharmacy',
          dosage: doseGroup.dose,
          injectionSite: site,
          notes,
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    // Create Retatrutide schedule with indefinite final phase
    const retatScheduleId = crypto.randomUUID()
    yield* sql`
      INSERT INTO injection_schedules (id, name, drug, source, frequency, start_date, is_active, notes, user_id, created_at, updated_at)
      VALUES (${retatScheduleId}, ${'Retatrutide Maintenance'}, ${'Retatrutide (Compounded)'}, ${'Compounding Pharmacy'}, ${'weekly'}, ${retatStartDate.toISOString()}, ${1}, ${'Active maintenance schedule with indefinite final phase'}, ${userId}, ${now}, ${now})
    `

    // Retatrutide phases: titration then indefinite maintenance
    const retatPhases = [
      { order: 1, durationDays: 14, dosage: '1mg' }, // weeks 1-2
      { order: 2, durationDays: 14, dosage: '2mg' }, // weeks 3-4
      { order: 3, durationDays: 14, dosage: '4mg' }, // weeks 5-6
      { order: 4, durationDays: 14, dosage: '8mg' }, // weeks 7-8
      { order: 5, durationDays: null, dosage: '12mg' }, // indefinite maintenance
    ]
    for (const phase of retatPhases) {
      const phaseId = crypto.randomUUID()
      yield* sql`
        INSERT INTO schedule_phases (id, schedule_id, "order", duration_days, dosage, created_at, updated_at)
        VALUES (${phaseId}, ${retatScheduleId}, ${phase.order}, ${phase.durationDays}, ${phase.dosage}, ${now}, ${now})
      `
    }
    console.log('Created Retatrutide schedule with indefinite maintenance phase')

    for (const entry of retatrutideEntries) {
      yield* sql`
        INSERT INTO injection_logs (id, datetime, drug, source, dosage, injection_site, notes, schedule_id, user_id, created_at, updated_at)
        VALUES (${entry.id}, ${entry.datetime}, ${entry.drug}, ${entry.source}, ${entry.dosage}, ${entry.injectionSite}, ${entry.notes}, ${retatScheduleId}, ${userId}, ${entry.createdAt}, ${entry.updatedAt})
      `
    }
    console.log(`Inserted ${retatrutideEntries.length} Retatrutide injections linked to schedule`)
  })

// Seed sparse user
const seedSparseUser = (sql: SqlClient.SqlClient, userId: string) =>
  Effect.gen(function* () {
    yield* sql`DELETE FROM weight_logs WHERE user_id = ${userId}`
    yield* sql`DELETE FROM injection_logs WHERE user_id = ${userId}`
    yield* sql`DELETE FROM schedule_phases WHERE schedule_id IN (SELECT id FROM injection_schedules WHERE user_id = ${userId})`
    yield* sql`DELETE FROM injection_schedules WHERE user_id = ${userId}`

    console.log(`\nGenerating sparse/irregular data for user ${userId}...`)

    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - 1)
    startDate.setHours(8, 0, 0, 0)

    const sites = ['left abdomen', 'right abdomen', 'left thigh', 'right thigh']

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

    const injectionEntries: Array<{
      id: string
      datetime: string
      drug: string
      source: string
      dosage: string
      injectionSite: string
      notes: string | null
      createdAt: string
      updatedAt: string
    }> = []

    for (const phase of phases) {
      if (!phase.active) continue
      for (let week = phase.startWeek; week <= phase.endWeek; week++) {
        if (Math.random() < 0.2) continue

        const injectionDate = new Date(startDate)
        const dayOffset = Math.floor(Math.random() * 6) - 2
        injectionDate.setDate(startDate.getDate() + (week - 1) * 7 + dayOffset)
        injectionDate.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0)

        const site = sites[Math.floor(Math.random() * sites.length)]

        let notes: string | null = null
        if (week === phase.startWeek && phase.notes) {
          notes = phase.notes
        } else if (Math.random() < 0.1) {
          const randomNotes = ['Forgot yesterday, taking today', 'Slight bruising', 'Easy injection', 'Running low']
          notes = randomNotes[Math.floor(Math.random() * randomNotes.length)]
        }

        const now = new Date().toISOString()
        injectionEntries.push({
          id: crypto.randomUUID(),
          datetime: injectionDate.toISOString(),
          drug: phase.drug,
          source: Math.random() > 0.3 ? 'Pharmacy' : 'Compounding pharmacy',
          dosage: phase.dose,
          injectionSite: site,
          notes,
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    for (const entry of injectionEntries) {
      yield* sql`
        INSERT INTO injection_logs (id, datetime, drug, source, dosage, injection_site, notes, schedule_id, user_id, created_at, updated_at)
        VALUES (${entry.id}, ${entry.datetime}, ${entry.drug}, ${entry.source}, ${entry.dosage}, ${entry.injectionSite}, ${entry.notes}, ${null}, ${userId}, ${entry.createdAt}, ${entry.updatedAt})
      `
    }
    console.log(`Inserted ${injectionEntries.length} injection logs`)

    type WeighPeriod = {
      startDay: number
      endDay: number
      frequency: 'daily' | 'weekly' | 'biweekly' | 'none'
    }
    const weighPeriods: WeighPeriod[] = [
      { startDay: 0, endDay: 7, frequency: 'daily' },
      { startDay: 8, endDay: 21, frequency: 'none' },
      { startDay: 22, endDay: 35, frequency: 'weekly' },
      { startDay: 36, endDay: 70, frequency: 'none' },
      { startDay: 71, endDay: 85, frequency: 'daily' },
      { startDay: 86, endDay: 140, frequency: 'biweekly' },
      { startDay: 141, endDay: 180, frequency: 'none' },
      { startDay: 181, endDay: 195, frequency: 'daily' },
      { startDay: 196, endDay: 250, frequency: 'weekly' },
      { startDay: 251, endDay: 280, frequency: 'none' },
      { startDay: 281, endDay: 300, frequency: 'daily' },
      { startDay: 301, endDay: 365, frequency: 'biweekly' },
    ]

    const getWeighFrequency = (day: number): 'daily' | 'weekly' | 'biweekly' | 'none' => {
      for (const period of weighPeriods) {
        if (day >= period.startDay && day <= period.endDay) return period.frequency
      }
      return 'none'
    }

    const getSparseUserWeight = (dayNum: number): number => {
      const startWeight = 240
      const progress = dayNum / 365
      const baseLoss = 20 * progress
      const fluctuation = Math.sin(dayNum * 0.3) * 3 + Math.cos(dayNum * 0.7) * 2
      return startWeight - baseLoss + fluctuation
    }

    const weightEntries: Array<{
      id: string
      datetime: string
      weight: number
      unit: string
      notes: string | null
      createdAt: string
      updatedAt: string
    }> = []

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

        const now = new Date().toISOString()
        weightEntries.push({
          id: crypto.randomUUID(),
          datetime: weightDate.toISOString(),
          weight,
          unit: 'lbs',
          notes,
          createdAt: now,
          updatedAt: now,
        })
      }

      day++
    }

    for (const entry of weightEntries) {
      yield* sql`
        INSERT INTO weight_logs (id, datetime, weight, unit, notes, user_id, created_at, updated_at)
        VALUES (${entry.id}, ${entry.datetime}, ${entry.weight}, ${entry.unit}, ${entry.notes}, ${userId}, ${entry.createdAt}, ${entry.updatedAt})
      `
    }

    console.log(`Inserted ${weightEntries.length} weight logs`)
  })

// Run it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Effect.runPromise(seedData.pipe(Effect.provide(SqlLive)) as any)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seeding failed:', err)
    process.exit(1)
  })
