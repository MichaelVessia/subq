import { Count, DayOfWeek, DaysBetween } from '../common/domain.js'
import { InjectionsPerWeek } from '../injection/domain.js'
import { DayOfWeekCount, InjectionDayOfWeekStats, InjectionFrequencyStats } from './domain.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_WEEK = 7 * MS_PER_DAY
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export const getDayOfWeekInTimezone = (date: Date, timezone: string): number => {
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: timezone,
  }).format(date)
  const day = DAY_NAMES.findIndex((dayName) => dayName === weekday)
  return day === -1 ? 0 : day
}

const countDaysOfWeek = (dates: readonly Date[], timezone: string): Map<number, number> => {
  const dayCounts = new Map<number, number>()

  for (const date of dates) {
    const dayOfWeek = getDayOfWeekInTimezone(date, timezone)
    dayCounts.set(dayOfWeek, (dayCounts.get(dayOfWeek) ?? 0) + 1)
  }

  return dayCounts
}

const mostFrequentDayOfWeek = (dayCounts: ReadonlyMap<number, number>): number | null => {
  let bestDay: number | null = null
  let bestCount = 0

  for (let day = 0; day < DAY_NAMES.length; day++) {
    const count = dayCounts.get(day) ?? 0
    if (count > bestCount) {
      bestDay = day
      bestCount = count
    }
  }

  return bestDay
}

export const buildInjectionDayOfWeekStats = (dates: readonly Date[], timezone = 'UTC'): InjectionDayOfWeekStats => {
  const dayCounts = countDaysOfWeek(dates, timezone)
  const days: DayOfWeekCount[] = []

  for (let day = 0; day < DAY_NAMES.length; day++) {
    const count = dayCounts.get(day) ?? 0
    if (count > 0) {
      days.push(new DayOfWeekCount({ dayOfWeek: DayOfWeek.make(day), count: Count.make(count) }))
    }
  }

  return new InjectionDayOfWeekStats({ days, totalInjections: Count.make(dates.length) })
}

export const buildObservedInjectionFrequency = (
  dates: readonly Date[],
  timezone = 'UTC',
): InjectionFrequencyStats | null => {
  if (dates.length === 0) return null

  const orderedDates = [...dates].sort((a, b) => a.getTime() - b.getTime())
  const firstDate = orderedDates[0]
  const lastDate = orderedDates[orderedDates.length - 1]
  if (firstDate === undefined || lastDate === undefined) return null

  let previousDate: Date | null = null
  let totalGapDays = 0
  let gapCount = 0
  for (const date of orderedDates) {
    if (previousDate !== null) {
      totalGapDays += (date.getTime() - previousDate.getTime()) / MS_PER_DAY
      gapCount += 1
    }
    previousDate = date
  }

  const periodWeeks = (lastDate.getTime() - firstDate.getTime()) / MS_PER_WEEK
  const injectionsPerWeek = periodWeeks > 0 ? orderedDates.length / periodWeeks : orderedDates.length
  const mostFrequentDay = mostFrequentDayOfWeek(countDaysOfWeek(orderedDates, timezone))

  return new InjectionFrequencyStats({
    totalInjections: Count.make(orderedDates.length),
    avgDaysBetween: DaysBetween.make(gapCount > 0 ? totalGapDays / gapCount : 0),
    mostFrequentDayOfWeek: mostFrequentDay === null ? null : DayOfWeek.make(mostFrequentDay),
    injectionsPerWeek: InjectionsPerWeek.make(injectionsPerWeek),
  })
}
