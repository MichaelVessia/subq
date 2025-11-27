import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import type {
  InjectionSchedule,
  InjectionScheduleCreate,
  InjectionScheduleId,
  InjectionScheduleUpdate,
  SchedulePhase,
} from '@subq/shared'
import { Link } from '@tanstack/react-router'
import { Calendar, Check, Edit, Eye, Pill, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ApiClient, ReactivityKeys, ScheduleListAtom } from '../../rpc.js'
import { Button } from '../ui/button.js'
import { Card } from '../ui/card.js'
import { ScheduleForm } from './schedule-form.js'

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(new Date(date))

const frequencyLabels: Record<string, string> = {
  daily: 'Daily',
  every_3_days: 'Every 3 days',
  weekly: 'Weekly',
  every_2_weeks: 'Every 2 weeks',
  monthly: 'Monthly',
}

type PhaseStatus = 'completed' | 'current' | 'upcoming'

function computePhaseStatus(
  phase: SchedulePhase,
  scheduleStartDate: Date,
  allPhases: readonly SchedulePhase[],
): PhaseStatus {
  const now = new Date()
  let phaseStart = new Date(scheduleStartDate)

  // Sum durations of previous phases to get this phase's start date
  for (const p of allPhases) {
    if (p.order < phase.order && p.durationDays !== null) {
      phaseStart = new Date(phaseStart.getTime() + p.durationDays * 24 * 60 * 60 * 1000)
    }
  }

  // Indefinite phase or phase with duration
  const phaseEnd =
    phase.durationDays !== null ? new Date(phaseStart.getTime() + phase.durationDays * 24 * 60 * 60 * 1000) : null

  if (now < phaseStart) return 'upcoming'
  if (phaseEnd && now >= phaseEnd) return 'completed'
  return 'current'
}

function ScheduleCard({
  schedule,
  onEdit,
  onDelete,
  onActivate,
}: {
  schedule: InjectionSchedule
  onEdit: () => void
  onDelete: () => void
  onActivate: () => void
}) {
  const hasIndefinitePhase = schedule.phases.some((p) => p.durationDays === null)
  const totalDays = hasIndefinitePhase ? null : schedule.phases.reduce((sum, p) => sum + (p.durationDays ?? 0), 0)

  return (
    <Card className={`p-4 ${schedule.isActive ? 'ring-2 ring-primary' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{schedule.name}</h3>
            {schedule.isActive && (
              <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Active</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{schedule.drug}</p>
        </div>
        <div className="flex items-center gap-1">
          {!schedule.isActive && (
            <Button variant="outline" size="sm" onClick={onActivate}>
              Activate
            </Button>
          )}
          <Link to="/schedule/$scheduleId" params={{ scheduleId: schedule.id }}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
        <div className="flex items-center gap-1">
          <Calendar className="h-4 w-4" />
          <span>Started {formatDate(schedule.startDate)}</span>
        </div>
        <span>{frequencyLabels[schedule.frequency] ?? schedule.frequency}</span>
        <span>{totalDays !== null ? `${totalDays} days total` : 'Indefinite'}</span>
      </div>

      <div className="space-y-1">
        {schedule.phases.map((phase) => {
          const status = computePhaseStatus(phase, schedule.startDate, schedule.phases)
          const statusStyles = {
            completed: 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700',
            current: 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700',
            upcoming: 'bg-muted border-muted-foreground/20',
          }
          const iconStyles = {
            completed: 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200',
            current: 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200',
            upcoming: 'bg-muted text-muted-foreground',
          }
          return (
            <div
              key={phase.id}
              className={`flex items-center gap-2 text-sm p-2 rounded border ${statusStyles[status]}`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${iconStyles[status]}`}
              >
                {status === 'completed' ? <Check className="h-3 w-3" /> : phase.order}
              </div>
              <span className="font-mono">{phase.dosage}</span>
              <span className="text-muted-foreground">
                {phase.durationDays !== null ? `for ${phase.durationDays} days` : '(ongoing)'}
              </span>
            </div>
          )
        })}
      </div>

      {schedule.notes && <p className="text-sm text-muted-foreground mt-3 italic">{schedule.notes}</p>}
    </Card>
  )
}

export function SchedulePage() {
  const schedulesResult = useAtomValue(ScheduleListAtom)
  const [showForm, setShowForm] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<InjectionSchedule | null>(null)

  const createSchedule = useAtomSet(ApiClient.mutation('ScheduleCreate'), { mode: 'promise' })
  const updateSchedule = useAtomSet(ApiClient.mutation('ScheduleUpdate'), { mode: 'promise' })
  const deleteSchedule = useAtomSet(ApiClient.mutation('ScheduleDelete'), { mode: 'promise' })

  const handleCreate = async (data: InjectionScheduleCreate) => {
    await createSchedule({
      payload: data,
      reactivityKeys: [ReactivityKeys.schedule],
    })
    setShowForm(false)
  }

  const handleUpdate = async (data: InjectionScheduleUpdate) => {
    await updateSchedule({
      payload: data,
      reactivityKeys: [ReactivityKeys.schedule],
    })
    setEditingSchedule(null)
  }

  const handleDelete = async (id: InjectionScheduleId) => {
    if (confirm('Delete this schedule?')) {
      await deleteSchedule({ payload: { id }, reactivityKeys: [ReactivityKeys.schedule] })
    }
  }

  const handleActivate = async (schedule: InjectionSchedule) => {
    await updateSchedule({
      payload: { id: schedule.id, isActive: true } as InjectionScheduleUpdate,
      reactivityKeys: [ReactivityKeys.schedule],
    })
  }

  if (Result.isWaiting(schedulesResult)) {
    return <div className="p-6 text-center text-muted-foreground">Loading...</div>
  }

  const schedules = Result.getOrElse(schedulesResult, () => [])

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Injection Schedule</h2>
          <p className="text-sm text-muted-foreground">Manage your injection schedule and titration phases</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Pill className="h-4 w-4 mr-2" />
          New Schedule
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6 p-6">
          <ScheduleForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </Card>
      )}

      {editingSchedule && (
        <Card className="mb-6 p-6">
          <ScheduleForm
            onSubmit={handleCreate}
            onUpdate={handleUpdate}
            onCancel={() => setEditingSchedule(null)}
            initialData={editingSchedule}
          />
        </Card>
      )}

      {schedules.length > 0 ? (
        <div className="space-y-4">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              onEdit={() => {
                setEditingSchedule(schedule)
                setShowForm(false)
              }}
              onDelete={() => handleDelete(schedule.id)}
              onActivate={() => handleActivate(schedule)}
            />
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <Pill className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No schedules yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first injection schedule to track your titration phases and get reminders for upcoming doses.
          </p>
          <Button onClick={() => setShowForm(true)}>Create Schedule</Button>
        </Card>
      )}
    </div>
  )
}
