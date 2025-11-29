import { useEffect, useState } from 'react'
import { type DateRange, TIME_RANGES, type TimeRangeKey } from '../../hooks/use-date-range-params.js'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'

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
