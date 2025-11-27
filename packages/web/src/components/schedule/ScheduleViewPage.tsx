import { Result, useAtomValue } from '@effect-atom/atom-react'
import type { InjectionScheduleId, SchedulePhaseView, ScheduleView } from '@scale/shared'
import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft, Calendar, Check, Clock, Syringe } from 'lucide-react'
import { useMemo } from 'react'
import { createScheduleViewAtom } from '../../rpc.js'
import { Card } from '../ui/card.js'

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(new Date(date))

const formatDateShort = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))

const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(date))

const frequencyLabels: Record<string, string> = {
  daily: 'Daily',
  every_3_days: 'Every 3 days',
  weekly: 'Weekly',
  every_2_weeks: 'Every 2 weeks',
  monthly: 'Monthly',
}

function PhaseCard({ phase, isLast }: { phase: SchedulePhaseView; isLast: boolean }) {
  const progressPercent =
    phase.expectedInjections > 0 ? Math.round((phase.completedInjections / phase.expectedInjections) * 100) : 0

  const statusColors = {
    completed: 'bg-green-100 border-green-300 dark:bg-green-900/30 dark:border-green-700',
    current: 'bg-blue-100 border-blue-300 dark:bg-blue-900/30 dark:border-blue-700',
    upcoming: 'bg-muted border-muted-foreground/20',
  }

  const statusBadges = {
    completed: (
      <span className="text-xs bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 px-2 py-0.5 rounded">
        Completed
      </span>
    ),
    current: (
      <span className="text-xs bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
        Current
      </span>
    ),
    upcoming: <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">Upcoming</span>,
  }

  return (
    <div className="relative">
      {/* Connection line */}
      {!isLast && <div className="absolute left-6 top-full h-4 w-0.5 bg-muted-foreground/30" />}

      <Card className={`p-4 border-2 ${statusColors[phase.status]}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm
              ${
                phase.status === 'completed'
                  ? 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200'
                  : phase.status === 'current'
                    ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {phase.status === 'completed' ? <Check className="h-5 w-5" /> : phase.order}
            </div>
            <div>
              <h3 className="font-semibold">Phase {phase.order}</h3>
              <p className="text-sm text-muted-foreground font-mono">{phase.dosage}</p>
            </div>
          </div>
          {statusBadges[phase.status]}
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>
              {formatDateShort(phase.startDate)} - {formatDateShort(phase.endDate)}
            </span>
          </div>
          <span>{phase.durationDays} days</span>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">
              {phase.completedInjections} / {phase.expectedInjections} injections
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                phase.status === 'completed'
                  ? 'bg-green-500'
                  : phase.status === 'current'
                    ? 'bg-blue-500'
                    : 'bg-muted-foreground/30'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Injection list */}
        {phase.injections.length > 0 && (
          <div className="border-t pt-3 mt-3">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <Syringe className="h-3 w-3" />
              Completed Injections
            </h4>
            <div className="space-y-1">
              {phase.injections.map((inj) => (
                <div key={inj.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{formatDateTime(inj.datetime)}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{inj.dosage}</span>
                    {inj.injectionSite && <span className="text-muted-foreground text-xs">@ {inj.injectionSite}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function ScheduleViewContent({ view }: { view: ScheduleView }) {
  const overallProgress =
    view.totalExpectedInjections > 0
      ? Math.round((view.totalCompletedInjections / view.totalExpectedInjections) * 100)
      : 0

  const currentPhase = view.phases.find((p) => p.status === 'current')
  const completedPhases = view.phases.filter((p) => p.status === 'completed').length

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link to="/schedule" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{view.name}</h2>
          <p className="text-sm text-muted-foreground">{view.drug}</p>
        </div>
        {view.isActive && (
          <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded ml-2">Active</span>
        )}
      </div>

      {/* Summary card */}
      <Card className="p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Schedule Period</p>
            <p className="font-medium">
              {formatDate(view.startDate)} - {formatDate(view.endDate)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Frequency</p>
            <p className="font-medium">{frequencyLabels[view.frequency] ?? view.frequency}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Current Phase</p>
            <p className="font-medium">
              {currentPhase
                ? `Phase ${currentPhase.order} of ${view.phases.length}`
                : `${completedPhases}/${view.phases.length} completed`}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Injections</p>
            <p className="font-medium">
              {view.totalCompletedInjections} / {view.totalExpectedInjections}
            </p>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-medium">{overallProgress}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${overallProgress}%` }} />
          </div>
        </div>

        {view.notes && <p className="text-sm text-muted-foreground mt-4 italic border-t pt-4">{view.notes}</p>}
      </Card>

      {/* Phases timeline */}
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4" />
        Schedule Phases
      </h3>
      <div className="space-y-4">
        {view.phases.map((phase, idx) => (
          <PhaseCard key={phase.id} phase={phase} isLast={idx === view.phases.length - 1} />
        ))}
      </div>
    </div>
  )
}

export function ScheduleViewPage() {
  const { scheduleId } = useParams({ from: '/schedule/$scheduleId' })

  const viewAtom = useMemo(() => createScheduleViewAtom(scheduleId as InjectionScheduleId), [scheduleId])
  const viewResult = useAtomValue(viewAtom)

  if (Result.isWaiting(viewResult)) {
    return <div className="p-6 text-center text-muted-foreground">Loading...</div>
  }

  const view = Result.getOrElse(viewResult, () => null)

  if (!view) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground mb-4">Schedule not found</p>
        <Link to="/schedule" className="text-primary hover:underline">
          Back to schedules
        </Link>
      </div>
    )
  }

  return <ScheduleViewContent view={view} />
}
