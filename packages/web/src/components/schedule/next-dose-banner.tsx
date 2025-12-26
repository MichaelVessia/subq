import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import {
  Dosage,
  DrugName,
  getNextSite,
  InjectionLogCreate,
  type InjectionScheduleId,
  InjectionSite,
  type NextScheduledDose,
} from '@subq/shared'
import { DateTime, Option } from 'effect'
import { Calendar, Clock, Pill, Zap } from 'lucide-react'
import { useState } from 'react'
import { toDate } from '../../lib/utils.js'
import { ApiClient, LastInjectionSiteAtom, NextDoseAtom, ReactivityKeys } from '../../rpc.js'
import { Button } from '../ui/button.js'
import { InlineError } from '../ui/error-states.js'

interface NextDoseBannerProps {
  onLogDose: (nextDose: NextScheduledDose) => void
  onQuickLogSuccess?: () => void
}

function formatDate(dt: DateTime.Utc): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(toDate(dt))
}

export function NextDoseBanner({ onLogDose, onQuickLogSuccess }: NextDoseBannerProps) {
  const nextDoseResult = useAtomValue(NextDoseAtom)
  const lastSiteResult = useAtomValue(LastInjectionSiteAtom)
  const createLog = useAtomSet(ApiClient.mutation('InjectionLogCreate'), { mode: 'promise' })
  const [quickLogging, setQuickLogging] = useState(false)

  // Use builder to handle all states - return null for loading/empty, show error inline
  const bannerContent = Result.builder(nextDoseResult)
    .onInitial(() => null)
    .onSuccess((nextDose) => {
      if (!nextDose) return null // No active schedule
      const lastSite = Result.getOrElse(lastSiteResult, () => null)
      return { nextDose, lastSite }
    })
    .onError(() => <InlineError message="Failed to load next dose info" />)
    .render()

  // If null (loading, empty, or no schedule), don't render anything
  if (!bannerContent || bannerContent === null) return null

  // If it's an error element, render it
  if ('type' in bannerContent) return bannerContent

  const { nextDose, lastSite } = bannerContent
  const nextSite = getNextSite(lastSite)

  const handleQuickLog = async () => {
    setQuickLogging(true)
    try {
      await createLog({
        payload: new InjectionLogCreate({
          datetime: DateTime.unsafeNow(),
          drug: DrugName.make(nextDose.drug),
          source: Option.none(),
          dosage: Dosage.make(nextDose.dosage),
          injectionSite: Option.some(InjectionSite.make(nextSite)),
          notes: Option.none(),
          scheduleId: Option.some(nextDose.scheduleId as InjectionScheduleId),
        }),
        reactivityKeys: [ReactivityKeys.injectionLogs, ReactivityKeys.injectionDrugs, ReactivityKeys.injectionSites],
      })
      onQuickLogSuccess?.()
    } finally {
      setQuickLogging(false)
    }
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

          <p className="text-xs text-muted-foreground mt-2">
            Quick log will use: <span className="font-medium">{nextSite}</span>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={handleQuickLog} size="sm" disabled={quickLogging}>
            <Zap className="h-4 w-4 mr-1" />
            {quickLogging ? 'Logging...' : 'Quick Log Now'}
          </Button>
          <Button onClick={() => onLogDose(nextDose)} size="sm" variant="outline">
            Customize Entry
          </Button>
        </div>
      </div>
    </div>
  )
}
