import { describe, expect, it } from '@effect/vitest'
import { buildDosageHistoryStats, parseDosageValue } from '../src/stats/index.js'

describe('DosageHistory', () => {
  it('parses numeric dosage values from common dosage strings', () => {
    expect(parseDosageValue('200mg')).toBe(200)
    expect(parseDosageValue('250 mcg')).toBe(250)
    expect(parseDosageValue('0.5ml')).toBe(0.5)
    expect(parseDosageValue('10 units')).toBe(10)
  })

  it('uses zero when dosage does not contain a number', () => {
    expect(parseDosageValue('unknown')).toBe(0)
  })

  it('builds dosage history points without changing order', () => {
    const stats = buildDosageHistoryStats([
      { date: new Date('2024-01-01T00:00:00Z'), drug: 'Testosterone', dosage: '200mg' },
      { date: new Date('2024-01-02T00:00:00Z'), drug: 'BPC-157', dosage: '250mcg' },
    ])

    expect(stats.points.map((point) => point.drug)).toEqual(['Testosterone', 'BPC-157'])
    expect(stats.points.map((point) => point.dosageValue)).toEqual([200, 250])
  })
})
