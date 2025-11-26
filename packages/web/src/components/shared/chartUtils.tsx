// ============================================
// Shared Chart Utilities
// ============================================

// Time Range Types and Options
export type TimeRangeKey = '1m' | '3m' | '6m' | '1y' | 'all'

export interface TimeRangeOption {
  label: string
  getRange: () => { startDate?: Date; endDate?: Date }
}

export const TIME_RANGES: Record<TimeRangeKey, TimeRangeOption> = {
  '1m': {
    label: '1 Month',
    getRange: () => {
      const end = new Date()
      const start = new Date()
      start.setMonth(start.getMonth() - 1)
      return { startDate: start, endDate: end }
    },
  },
  '3m': {
    label: '3 Months',
    getRange: () => {
      const end = new Date()
      const start = new Date()
      start.setMonth(start.getMonth() - 3)
      return { startDate: start, endDate: end }
    },
  },
  '6m': {
    label: '6 Months',
    getRange: () => {
      const end = new Date()
      const start = new Date()
      start.setMonth(start.getMonth() - 6)
      return { startDate: start, endDate: end }
    },
  },
  '1y': {
    label: '1 Year',
    getRange: () => {
      const end = new Date()
      const start = new Date()
      start.setFullYear(start.getFullYear() - 1)
      return { startDate: start, endDate: end }
    },
  },
  all: {
    label: 'All Time',
    getRange: () => ({}),
  },
}

// ============================================
// Color palette for dosages - muted tones
// ============================================

export const DOSAGE_COLORS: Record<string, string> = {
  '2.5mg': '#64748b', // slate
  '5mg': '#0891b2', // cyan
  '7.5mg': '#0d9488', // teal
  '10mg': '#059669', // emerald
  '12.5mg': '#7c3aed', // violet
  '15mg': '#be185d', // pink
}

const FALLBACK_COLORS = ['#64748b', '#475569', '#334155', '#1e293b', '#0f172a']

export function getDosageColor(dosage: string): string {
  const mapped = DOSAGE_COLORS[dosage]
  if (mapped) return mapped
  const hash = dosage.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length] ?? '#64748b'
}

export const CHART_COLORS = [
  '#0891b2', // cyan
  '#059669', // emerald
  '#7c3aed', // violet
  '#be185d', // pink
  '#64748b', // slate
  '#f59e0b', // amber
  '#10b981', // green
  '#6366f1', // indigo
]

// ============================================
// Types
// ============================================

export interface DataPoint {
  date: Date
  weight: number
  notes?: string | null
}

export interface InjectionPoint {
  date: Date
  weight: number
  dosage: string
  drug: string
  injectionSite?: string | null
  notes?: string | null
}

export interface WeightPointWithColor extends DataPoint {
  color: string
}

// ============================================
// Tooltip Component
// ============================================

export function Tooltip({
  content,
  position,
}: {
  content: React.ReactNode
  position: { x: number; y: number } | null
}) {
  if (!position) return null
  return (
    <div
      style={{
        position: 'fixed',
        left: position.x + 12,
        top: position.y - 12,
        backgroundColor: 'var(--color-text)',
        color: 'var(--color-surface)',
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--text-xs)',
        lineHeight: '1.5',
        pointerEvents: 'none',
        zIndex: 1000,
        maxWidth: '220px',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      {content}
    </div>
  )
}

// ============================================
// Time Range Selector Component
// ============================================

import { useState, useEffect } from 'react'

function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0] ?? ''
}

function DateRangeInputs({
  range,
  onRangeChange,
}: {
  range: { start: Date; end: Date }
  onRangeChange: (range: { start: Date; end: Date }) => void
}) {
  const [startValue, setStartValue] = useState(formatDateForInput(range.start))
  const [endValue, setEndValue] = useState(formatDateForInput(range.end))

  // Sync local state when range changes externally (e.g., from chart drag)
  useEffect(() => {
    setStartValue(formatDateForInput(range.start))
    setEndValue(formatDateForInput(range.end))
  }, [range.start, range.end])

  const handleStartBlur = () => {
    const newStart = new Date(startValue)
    if (!Number.isNaN(newStart.getTime()) && newStart < range.end) {
      onRangeChange({ start: newStart, end: range.end })
    } else {
      setStartValue(formatDateForInput(range.start))
    }
  }

  const handleEndBlur = () => {
    const newEnd = new Date(endValue)
    if (!Number.isNaN(newEnd.getTime()) && newEnd > range.start) {
      onRangeChange({ start: range.start, end: newEnd })
    } else {
      setEndValue(formatDateForInput(range.end))
    }
  }

  const dateInputStyle: React.CSSProperties = {
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text)',
    fontSize: 'var(--text-sm)',
    fontFamily: 'var(--font-mono)',
  }

  return (
    <div className="date-range-inputs">
      <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>From</span>
      <input
        type="date"
        value={startValue}
        onChange={(e) => setStartValue(e.target.value)}
        onBlur={handleStartBlur}
        style={dateInputStyle}
      />
      <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>to</span>
      <input
        type="date"
        value={endValue}
        onChange={(e) => setEndValue(e.target.value)}
        onBlur={handleEndBlur}
        style={dateInputStyle}
      />
    </div>
  )
}

export interface DateRange {
  start: Date | undefined
  end: Date | undefined
}

export function TimeRangeSelector({
  range,
  activePreset,
  onPresetChange,
  onRangeChange,
}: {
  range: DateRange
  activePreset: TimeRangeKey | null
  onPresetChange: (key: TimeRangeKey) => void
  onRangeChange: (range: DateRange) => void
}) {
  const keys = Object.keys(TIME_RANGES) as TimeRangeKey[]
  const hasCustomRange = range.start && range.end && !activePreset

  const buttonStyle = (isSelected: boolean): React.CSSProperties => ({
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    backgroundColor: isSelected ? 'var(--color-text)' : 'var(--color-surface)',
    color: isSelected ? 'var(--color-surface)' : 'var(--color-text)',
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  })

  return (
    <div className="time-range-selector">
      <div className="time-range-buttons">
        {keys.map((key) => (
          <button key={key} onClick={() => onPresetChange(key)} type="button" style={buttonStyle(activePreset === key)}>
            {TIME_RANGES[key].label}
          </button>
        ))}
      </div>
      {hasCustomRange && (
        <div className="time-range-custom">
          <DateRangeInputs
            range={{ start: range.start!, end: range.end! }}
            onRangeChange={(r) => onRangeChange({ start: r.start, end: r.end })}
          />
          <button type="button" onClick={() => onPresetChange('all')} style={buttonStyle(false)}>
            Reset
          </button>
        </div>
      )}
    </div>
  )
}
