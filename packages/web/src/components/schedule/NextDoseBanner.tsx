import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import {
  Dosage,
  DrugName,
  InjectionLogCreate,
  type InjectionScheduleId,
  InjectionSite,
  type NextScheduledDose,
} from '@scale/shared'
import { Option } from 'effect'
import { Calendar, Clock, Pill, Zap } from 'lucide-react'
import { useState } from 'react'
import { ApiClient, LastInjectionSiteAtom, NextDoseAtom, ReactivityKeys } from '../../rpc.js'
import { Button } from '../ui/button.js'

// Standard injection site rotation order
const SITE_ROTATION = [
  'Left abdomen',
  'Right abdomen',
  'Left thigh',
  'Right thigh',
  'Left upper arm',
  'Right upper arm',
]

function getNextSite(lastSite: string | null): string {
  const defaultSite = SITE_ROTATION[0] ?? 'Left abdomen'
  if (!lastSite) return defaultSite
  const currentIndex = SITE_ROTATION.indexOf(lastSite)
  if (currentIndex === -1) return defaultSite
  return SITE_ROTATION[(currentIndex + 1) % SITE_ROTATION.length] ?? defaultSite
}

interface NextDoseBannerProps {
  onLogDose: (nextDose: NextScheduledDose) => void
  onQuickLogSuccess?: () => void
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function NextDoseBanner({ onLogDose, onQuickLogSuccess }: NextDoseBannerProps) {
  const nextDoseResult = useAtomValue(NextDoseAtom)
  const lastSiteResult = useAtomValue(LastInjectionSiteAtom)
  const createLog = useAtomSet(ApiClient.mutation('InjectionLogCreate'), { mode: 'promise' })
  const [quickLogging, setQuickLogging] = useState(false)

  if (Result.isWaiting(nextDoseResult)) {
    return null // Don't show loading state for banner
  }

  const nextDose = Result.getOrElse(nextDoseResult, () => null)
  if (!nextDose) {
    return null // No active schedule
  }

  const lastSite = Result.getOrElse(lastSiteResult, () => null)
  const nextSite = getNextSite(lastSite)

  const handleQuickLog = async () => {
    setQuickLogging(true)
    try {
      await createLog({
        payload: new InjectionLogCreate({
          datetime: new Date(),
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
