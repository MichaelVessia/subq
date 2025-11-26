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
  zoomRange,
  onZoomChange,
}: {
  zoomRange: { start: Date; end: Date }
  onZoomChange: (range: { start: Date; end: Date }) => void
}) {
  const [startValue, setStartValue] = useState(formatDateForInput(zoomRange.start))
  const [endValue, setEndValue] = useState(formatDateForInput(zoomRange.end))

  // Sync local state when zoomRange changes externally (e.g., from chart drag)
  useEffect(() => {
    setStartValue(formatDateForInput(zoomRange.start))
    setEndValue(formatDateForInput(zoomRange.end))
  }, [zoomRange.start, zoomRange.end])

  const handleStartBlur = () => {
    const newStart = new Date(startValue)
    if (!Number.isNaN(newStart.getTime()) && newStart < zoomRange.end) {
      onZoomChange({ start: newStart, end: zoomRange.end })
    } else {
      setStartValue(formatDateForInput(zoomRange.start))
    }
  }

  const handleEndBlur = () => {
    const newEnd = new Date(endValue)
    if (!Number.isNaN(newEnd.getTime()) && newEnd > zoomRange.start) {
      onZoomChange({ start: zoomRange.start, end: newEnd })
    } else {
      setEndValue(formatDateForInput(zoomRange.end))
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
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
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

export function TimeRangeSelector({
  selected,
  onChange,
  zoomRange,
  onResetZoom,
  onZoomChange,
}: {
  selected: TimeRangeKey
  onChange: (key: TimeRangeKey) => void
  zoomRange?: { start: Date; end: Date } | null
  onResetZoom?: () => void
  onZoomChange?: (range: { start: Date; end: Date }) => void
}) {
  const keys = Object.keys(TIME_RANGES) as TimeRangeKey[]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {keys.map((key) => {
          const isSelected = selected === key && !zoomRange
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              type="button"
              style={{
                padding: 'var(--space-2) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: isSelected ? 'var(--color-text)' : 'var(--color-surface)',
                color: isSelected ? 'var(--color-surface)' : 'var(--color-text)',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {TIME_RANGES[key].label}
            </button>
          )
        })}
      </div>
      {zoomRange && onResetZoom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {onZoomChange && <DateRangeInputs zoomRange={zoomRange} onZoomChange={onZoomChange} />}
          <button
            type="button"
            onClick={onResetZoom}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  )
}
