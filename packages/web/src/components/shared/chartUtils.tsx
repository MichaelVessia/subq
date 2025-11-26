import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils.js'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'

// ============================================
// Time Range Types and Options
// ============================================

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
      className="fixed bg-foreground text-background px-3.5 py-2.5 rounded-md text-xs leading-relaxed pointer-events-none z-[1000] max-w-[220px] shadow-md"
      style={{
        left: position.x + 12,
        top: position.y - 12,
      }}
    >
      {content}
    </div>
  )
}

// ============================================
// Responsive Container Hook
// ============================================

export function useContainerSize<T extends HTMLElement = HTMLDivElement>(): {
  containerRef: React.RefObject<T | null>
  width: number
} {
  const containerRef = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width
        setWidth(newWidth)
      }
    })

    observer.observe(element)
    setWidth(element.clientWidth)

    return () => observer.disconnect()
  }, [])

  return { containerRef, width }
}

// ============================================
// Date Range Inputs Component
// ============================================

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

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline">
      <span className="text-sm text-muted-foreground">From</span>
      <Input
        type="date"
        value={startValue}
        onChange={(e) => setStartValue(e.target.value)}
        onBlur={handleStartBlur}
        className="w-auto font-mono h-8 px-2"
      />
      <span className="text-sm text-muted-foreground">to</span>
      <Input
        type="date"
        value={endValue}
        onChange={(e) => setEndValue(e.target.value)}
        onBlur={handleEndBlur}
        className="w-auto font-mono h-8 px-2"
      />
    </div>
  )
}

// ============================================
// Time Range Selector Component
// ============================================

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

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap sm:gap-4">
      <div className="flex gap-2 flex-wrap">
        {keys.map((key) => (
          <Button
            key={key}
            onClick={() => onPresetChange(key)}
            variant={activePreset === key ? 'default' : 'outline'}
            size="sm"
            className={cn(activePreset === key && 'bg-foreground text-background hover:bg-foreground/90')}
          >
            {TIME_RANGES[key].label}
          </Button>
        ))}
      </div>
      {hasCustomRange && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <DateRangeInputs
            range={{ start: range.start!, end: range.end! }}
            onRangeChange={(r) => onRangeChange({ start: r.start, end: r.end })}
          />
          <Button variant="outline" size="sm" onClick={() => onPresetChange('all')}>
            Reset
          </Button>
        </div>
      )}
    </div>
  )
}
