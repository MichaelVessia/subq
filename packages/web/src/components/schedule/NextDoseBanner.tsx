import { Result, useAtomValue } from '@effect-atom/atom-react'
import type { NextScheduledDose } from '@scale/shared'
import { Calendar, Clock, Pill } from 'lucide-react'
import { NextDoseAtom } from '../../rpc.js'
import { Button } from '../ui/button.js'

interface NextDoseBannerProps {
  onLogDose: (nextDose: NextScheduledDose) => void
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function NextDoseBanner({ onLogDose }: NextDoseBannerProps) {
  const nextDoseResult = useAtomValue(NextDoseAtom)

  if (Result.isWaiting(nextDoseResult)) {
    return null // Don't show loading state for banner
  }

  const nextDose = Result.getOrElse(nextDoseResult, () => null)
  if (!nextDose) {
    return null // No active schedule
  }

  const dueText =
    nextDose.daysUntilDue === 0
      ? 'Due today'
      : nextDose.daysUntilDue === 1
        ? 'Due tomorrow'
        : nextDose.daysUntilDue > 0
          ? `Due in ${nextDose.daysUntilDue} days`
          : `${Math.abs(nextDose.daysUntilDue)} day${Math.abs(nextDose.daysUntilDue) === 1 ? '' : 's'} overdue`

  return (
    <div
      className={`rounded-lg p-4 mb-6 border ${
        nextDose.isOverdue
          ? 'bg-destructive/10 border-destructive/20'
          : nextDose.daysUntilDue <= 1
            ? 'bg-amber-500/10 border-amber-500/20'
            : 'bg-primary/5 border-primary/20'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Pill className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Next Scheduled Dose</h3>
            <span className="text-xs bg-muted px-2 py-0.5 rounded">
              Phase {nextDose.currentPhase}/{nextDose.totalPhases}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="font-medium">{nextDose.drug}</span>
              <span className="text-muted-foreground">-</span>
              <span className="font-mono text-primary">{nextDose.dosage}</span>
            </div>

            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(nextDose.suggestedDate)}</span>
            </div>

            <div
              className={`flex items-center gap-1.5 ${
                nextDose.isOverdue
                  ? 'text-destructive'
                  : nextDose.daysUntilDue <= 1
                    ? 'text-amber-600'
                    : 'text-muted-foreground'
              }`}
            >
              <Clock className="h-4 w-4" />
              <span className="font-medium">{dueText}</span>
            </div>
          </div>
        </div>

        <Button onClick={() => onLogDose(nextDose)} size="sm">
          Log This Dose
        </Button>
      </div>
    </div>
  )
}
