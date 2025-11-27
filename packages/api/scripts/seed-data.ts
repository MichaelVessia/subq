/**
 * Shared seed data generators
 * Used by both local seed.ts and export-seed-sql.ts for prod
 */

// Types for generated data
export type InjectionEntry = {
  id: string
  datetime: string
  drug: string
  source: string
  dosage: string
  injectionSite: string
  notes: string | null
  scheduleId: string | null
  createdAt: string
  updatedAt: string
}

export type WeightEntry = {
  id: string
  datetime: string
  weight: number
  unit: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type InventoryEntry = {
  id: string
  drug: string
  source: string
  form: 'vial' | 'pen'
  totalAmount: string
  status: 'new' | 'opened' | 'finished'
  beyondUseDate: string | null
  createdAt: string
  updatedAt: string
}

export type ScheduleEntry = {
  id: string
  name: string
  drug: string
  source: string | null
  frequency: string
  startDate: string
  isActive: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type PhaseEntry = {
  id: string
  scheduleId: string
  order: number
  durationDays: number | null
  dosage: string
  createdAt: string
  updatedAt: string
}

export type ConsistentUserData = {
  schedules: ScheduleEntry[]
  phases: PhaseEntry[]
  injections: InjectionEntry[]
  weights: WeightEntry[]
  inventory: InventoryEntry[]
}

const sites = ['left abdomen', 'right abdomen', 'left thigh', 'right thigh']

// Dose schedule helper
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

/**
 * Generate consistent user data (full year of regular tracking)
 */
export function generateConsistentUserData(): ConsistentUserData {
  const now = new Date().toISOString()
  const startDate = new Date()
  startDate.setFullYear(startDate.getFullYear() - 1)
  startDate.setHours(8, 0, 0, 0)

  const schedules: ScheduleEntry[] = []
  const phases: PhaseEntry[] = []
  const injections: InjectionEntry[] = []
  const weights: WeightEntry[] = []
  const inventory: InventoryEntry[] = []

  // Create Semaglutide schedule (weeks 1-20)
  const semaScheduleId = crypto.randomUUID()
  const semaStartDate = new Date(startDate)
  schedules.push({
    id: semaScheduleId,
    name: 'Semaglutide Titration',
    drug: 'Semaglutide',
    source: null,
    frequency: 'weekly',
    startDate: semaStartDate.toISOString(),
    isActive: false,
    notes: 'Completed 20-week titration',
    createdAt: now,
    updatedAt: now,
  })

  const semaPhases = [
    { order: 1, durationDays: 28, dosage: '2.5mg' },
    { order: 2, durationDays: 28, dosage: '5mg' },
    { order: 3, durationDays: 28, dosage: '7.5mg' },
    { order: 4, durationDays: 28, dosage: '10mg' },
    { order: 5, durationDays: 28, dosage: '15mg' },
  ]
  for (const phase of semaPhases) {
    phases.push({
      id: crypto.randomUUID(),
      scheduleId: semaScheduleId,
      order: phase.order,
      durationDays: phase.durationDays,
      dosage: phase.dosage,
      createdAt: now,
      updatedAt: now,
    })
  }

  // Create Tirzepatide schedule (weeks 21-40)
  const tirzScheduleId = crypto.randomUUID()
  const tirzStartDate = new Date(startDate)
  tirzStartDate.setDate(tirzStartDate.getDate() + 20 * 7)
  schedules.push({
    id: tirzScheduleId,
    name: 'Tirzepatide Titration',
    drug: 'Tirzepatide',
    source: null,
    frequency: 'weekly',
    startDate: tirzStartDate.toISOString(),
    isActive: false,
    notes: 'Completed - switched to Retatrutide',
    createdAt: now,
    updatedAt: now,
  })

  const tirzPhases = [
    { order: 1, durationDays: 28, dosage: '2.5mg' },
    { order: 2, durationDays: 28, dosage: '5mg' },
    { order: 3, durationDays: 28, dosage: '7.5mg' },
    { order: 4, durationDays: 28, dosage: '10mg' },
    { order: 5, durationDays: 28, dosage: '15mg' },
  ]
  for (const phase of tirzPhases) {
    phases.push({
      id: crypto.randomUUID(),
      scheduleId: tirzScheduleId,
      order: phase.order,
      durationDays: phase.durationDays,
      dosage: phase.dosage,
      createdAt: now,
      updatedAt: now,
    })
  }

  // Create Retatrutide schedule (weeks 41+)
  const retatScheduleId = crypto.randomUUID()
  const retatStartDate = new Date(startDate)
  retatStartDate.setDate(retatStartDate.getDate() + 40 * 7)
  schedules.push({
    id: retatScheduleId,
    name: 'Retatrutide Maintenance',
    drug: 'Retatrutide (Compounded)',
    source: 'Compounding Pharmacy',
    frequency: 'weekly',
    startDate: retatStartDate.toISOString(),
    isActive: true,
    notes: 'Active maintenance schedule with indefinite final phase',
    createdAt: now,
    updatedAt: now,
  })

  const retatPhases = [
    { order: 1, durationDays: 14, dosage: '1mg' },
    { order: 2, durationDays: 14, dosage: '2mg' },
    { order: 3, durationDays: 14, dosage: '4mg' },
    { order: 4, durationDays: 14, dosage: '8mg' },
    { order: 5, durationDays: null, dosage: '12mg' },
  ]
  for (const phase of retatPhases) {
    phases.push({
      id: crypto.randomUUID(),
      scheduleId: retatScheduleId,
      order: phase.order,
      durationDays: phase.durationDays,
      dosage: phase.dosage,
      createdAt: now,
      updatedAt: now,
    })
  }

  // Generate injection logs for weeks 1-40
  for (let week = 1; week <= 40; week++) {
    const drugDose = getDrugAndDose(week)
    if (!drugDose) continue

    const { drug, dose } = drugDose
    const injectionDate = new Date(startDate)
    injectionDate.setDate(startDate.getDate() + (week - 1) * 7)
    injectionDate.setHours(18, Math.floor(Math.random() * 30), 0, 0)

    const site = sites[(week - 1) % sites.length]!
    const prevDrugDose = week > 1 ? getDrugAndDose(week - 1) : null

    let notes: string | null = null
    if (week === 1) notes = 'First injection - starting journey'
    else if (week === 21) notes = 'Switching to Tirzepatide'
    else if (prevDrugDose && dose !== prevDrugDose.dose && drug === prevDrugDose.drug)
      notes = `Dose increase to ${dose}`
    else if (week === 40) notes = 'Completing Tirzepatide, trying Retatrutide next'

    const scheduleId = drug === 'Semaglutide' ? semaScheduleId : tirzScheduleId
    injections.push({
      id: crypto.randomUUID(),
      datetime: injectionDate.toISOString(),
      drug,
      source: 'Pharmacy',
      dosage: dose,
      injectionSite: site,
      notes,
      scheduleId,
      createdAt: now,
      updatedAt: now,
    })
  }

  // Generate Retatrutide injections
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

      const site = sites[(week - 1) % sites.length]!
      let notes: string | null = null
      if (week === 1) notes = 'Starting Retatrutide - switching from Tirzepatide'
      else if (doseGroup.weeks[0] === week && week > 1) notes = `Increased to ${doseGroup.dose}`

      injections.push({
        id: crypto.randomUUID(),
        datetime: injDate.toISOString(),
        drug: 'Retatrutide (Compounded)',
        source: 'Compounding Pharmacy',
        dosage: doseGroup.dose,
        injectionSite: site,
        notes,
        scheduleId: retatScheduleId,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

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

      weights.push({
        id: crypto.randomUUID(),
        datetime: weightDate.toISOString(),
        weight,
        unit: 'lbs',
        notes,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  // Generate inventory
  // Semaglutide vials (weeks 1-20)
  const semaVials = [
    { totalAmount: '10mg', weekStart: 1 },
    { totalAmount: '20mg', weekStart: 5 },
    { totalAmount: '30mg', weekStart: 9 },
    { totalAmount: '40mg', weekStart: 13 },
    { totalAmount: '60mg', weekStart: 17 },
  ]

  for (const vial of semaVials) {
    const openedDate = new Date(startDate)
    openedDate.setDate(openedDate.getDate() + (vial.weekStart - 1) * 7)
    const beyondUseDate = new Date(openedDate)
    beyondUseDate.setDate(beyondUseDate.getDate() + 28)

    inventory.push({
      id: crypto.randomUUID(),
      drug: 'Semaglutide',
      source: 'Pharmacy',
      form: 'vial',
      totalAmount: vial.totalAmount,
      status: 'finished',
      beyondUseDate: beyondUseDate.toISOString(),
      createdAt: openedDate.toISOString(),
      updatedAt: now,
    })
  }

  // Tirzepatide vials (weeks 21-40)
  const tirzVials = [
    { totalAmount: '10mg', weekStart: 21 },
    { totalAmount: '20mg', weekStart: 25 },
    { totalAmount: '30mg', weekStart: 29 },
    { totalAmount: '40mg', weekStart: 33 },
    { totalAmount: '60mg', weekStart: 37 },
  ]

  for (const vial of tirzVials) {
    const openedDate = new Date(startDate)
    openedDate.setDate(openedDate.getDate() + (vial.weekStart - 1) * 7)
    const beyondUseDate = new Date(openedDate)
    beyondUseDate.setDate(beyondUseDate.getDate() + 28)

    inventory.push({
      id: crypto.randomUUID(),
      drug: 'Tirzepatide',
      source: 'Pharmacy',
      form: 'vial',
      totalAmount: vial.totalAmount,
      status: 'finished',
      beyondUseDate: beyondUseDate.toISOString(),
      createdAt: openedDate.toISOString(),
      updatedAt: now,
    })
  }

  // Retatrutide vials (weeks 41+)
  const retatVials = [
    { totalAmount: '2mg', weekStart: 41 },
    { totalAmount: '4mg', weekStart: 43 },
    { totalAmount: '8mg', weekStart: 45 },
    { totalAmount: '16mg', weekStart: 47 },
  ]

  for (const vial of retatVials) {
    const openedDate = new Date(startDate)
    openedDate.setDate(openedDate.getDate() + (vial.weekStart - 1) * 7)
    if (openedDate > new Date()) continue

    const beyondUseDate = new Date(openedDate)
    beyondUseDate.setDate(beyondUseDate.getDate() + 28)

    inventory.push({
      id: crypto.randomUUID(),
      drug: 'Retatrutide (Compounded)',
      source: 'Compounding Pharmacy',
      form: 'vial',
      totalAmount: vial.totalAmount,
      status: 'finished',
      beyondUseDate: beyondUseDate.toISOString(),
      createdAt: openedDate.toISOString(),
      updatedAt: now,
    })
  }

  // Current Retatrutide vial (opened)
  const currentRetatStart = new Date(startDate)
  currentRetatStart.setDate(currentRetatStart.getDate() + (49 - 1) * 7)
  if (currentRetatStart <= new Date()) {
    const beyondUseDate = new Date(currentRetatStart)
    beyondUseDate.setDate(beyondUseDate.getDate() + 28)

    inventory.push({
      id: crypto.randomUUID(),
      drug: 'Retatrutide (Compounded)',
      source: 'Compounding Pharmacy',
      form: 'vial',
      totalAmount: '48mg',
      status: 'opened',
      beyondUseDate: beyondUseDate.toISOString(),
      createdAt: currentRetatStart.toISOString(),
      updatedAt: now,
    })
  }

  return { schedules, phases, injections, weights, inventory }
}
