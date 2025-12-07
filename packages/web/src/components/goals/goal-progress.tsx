import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import type { GoalProgress, UserGoalCreate, UserGoalUpdate } from '@subq/shared'
import { UserGoalDelete } from '@subq/shared'
import { Target, TrendingDown, TrendingUp, Calendar, Minus, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ApiClient, GoalProgressAtom, ReactivityKeys } from '../../rpc.js'
import { Button } from '../ui/button.js'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.js'
import { GoalForm } from './goal-form.js'

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(new Date(date))

function PaceStatusBadge({ status }: { status: GoalProgress['paceStatus'] }) {
  const config = {
    ahead: { label: 'Ahead of pace', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
    on_track: { label: 'On track', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
    behind: {
      label: 'Behind pace',
      className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    },
    not_losing: { label: 'Not losing', className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  }[status]

  return <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.className}`}>{config.label}</span>
}

function ProgressBar({ percent }: { percent: number }) {
  const clampedPercent = Math.min(100, Math.max(0, percent))
  return (
    <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
      <div
        className="bg-primary h-full rounded-full transition-all duration-500"
        style={{ width: `${clampedPercent}%` }}
      />
    </div>
  )
}

function GoalProgressDisplay({ progress }: { progress: GoalProgress }) {
  const {
    goal,
    currentWeight,
    lbsLost,
    lbsRemaining,
    percentComplete,
    projectedDate,
    paceStatus,
    daysOnPlan,
    avgLbsPerWeek,
  } = progress

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Progress to goal</span>
          <PaceStatusBadge status={paceStatus} />
        </div>
        <ProgressBar percent={percentComplete} />
        <div className="flex justify-between mt-2 text-sm">
          <span className="font-mono">{goal.startingWeight.toFixed(1)} lbs</span>
          <span className="font-semibold">{percentComplete.toFixed(0)}%</span>
          <span className="font-mono">{goal.goalWeight.toFixed(1)} lbs</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
            <TrendingDown className="w-4 h-4" />
            <span className="text-xs">Lost</span>
          </div>
          <span className="font-mono font-semibold text-lg">{lbsLost.toFixed(1)}</span>
          <span className="text-xs text-muted-foreground ml-1">lbs</span>
        </div>

        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
            <Target className="w-4 h-4" />
            <span className="text-xs">To Go</span>
          </div>
          <span className="font-mono font-semibold text-lg">{lbsRemaining.toFixed(1)}</span>
          <span className="text-xs text-muted-foreground ml-1">lbs</span>
        </div>

        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
            {avgLbsPerWeek > 0 ? (
              <TrendingDown className="w-4 h-4" />
            ) : avgLbsPerWeek < 0 ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <Minus className="w-4 h-4" />
            )}
            <span className="text-xs">Avg/Week</span>
          </div>
          <span className="font-mono font-semibold text-lg">{avgLbsPerWeek.toFixed(2)}</span>
          <span className="text-xs text-muted-foreground ml-1">lbs</span>
        </div>

        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
            <Calendar className="w-4 h-4" />
            <span className="text-xs">Days</span>
          </div>
          <span className="font-mono font-semibold text-lg">{daysOnPlan}</span>
          <span className="text-xs text-muted-foreground ml-1">on plan</span>
        </div>
      </div>

      {/* Projected Date */}
      {projectedDate && (
        <div className="p-3 bg-muted/50 rounded-lg">
          <span className="text-sm text-muted-foreground">Projected goal date: </span>
          <span className="font-semibold">{formatDate(projectedDate)}</span>
          {goal.targetDate && (
            <span className="text-xs text-muted-foreground ml-2">(Target: {formatDate(goal.targetDate)})</span>
          )}
        </div>
      )}

      {/* Current Weight */}
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <span className="text-muted-foreground">Current weight</span>
        <span className="font-mono font-semibold text-xl">{currentWeight.toFixed(1)} lbs</span>
      </div>
    </div>
  )
}

export function GoalProgressCard() {
  const progressResult = useAtomValue(GoalProgressAtom)
  const [showForm, setShowForm] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const createGoal = useAtomSet(ApiClient.mutation('GoalCreate'), { mode: 'promise' })
  const updateGoal = useAtomSet(ApiClient.mutation('GoalUpdate'), { mode: 'promise' })
  const deleteGoal = useAtomSet(ApiClient.mutation('GoalDelete'), { mode: 'promise' })

  const handleCreate = async (data: UserGoalCreate) => {
    await createGoal({ payload: data, reactivityKeys: [ReactivityKeys.goals] })
    setShowForm(false)
  }

  const handleUpdate = async (data: UserGoalUpdate) => {
    await updateGoal({ payload: data, reactivityKeys: [ReactivityKeys.goals] })
    setEditMode(false)
  }

  const handleDelete = async (goalId: string) => {
    await deleteGoal({ payload: new UserGoalDelete({ id: goalId as any }), reactivityKeys: [ReactivityKeys.goals] })
    setShowDeleteConfirm(false)
  }

  if (Result.isWaiting(progressResult)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Goal Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    )
  }

  const progress = Result.getOrElse(progressResult, () => null as GoalProgress | null)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Goal Progress
          </CardTitle>

          {progress && !editMode && !showDeleteConfirm && (
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditMode(true)} title="Edit goal">
                <Pencil className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowDeleteConfirm(true)} title="Delete goal">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {showForm ? (
          <GoalForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
            currentWeight={progress?.currentWeight}
          />
        ) : editMode && progress ? (
          <GoalForm
            mode="edit"
            existingGoal={progress.goal}
            onSubmit={handleUpdate}
            onCancel={() => setEditMode(false)}
            currentWeight={progress.currentWeight}
          />
        ) : showDeleteConfirm && progress ? (
          <div className="text-center py-6">
            <Trash2 className="w-12 h-12 mx-auto text-destructive mb-4" />
            <p className="text-lg font-medium mb-2">Delete this goal?</p>
            <p className="text-muted-foreground mb-6">
              This will permanently delete your goal and all associated progress data.
            </p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => handleDelete(progress.goal.id)}>
                Delete Goal
              </Button>
            </div>
          </div>
        ) : progress ? (
          <GoalProgressDisplay progress={progress} />
        ) : (
          <div className="text-center py-8">
            <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              Set a goal weight to track your progress and see milestone achievements!
            </p>
            <Button onClick={() => setShowForm(true)}>Set Your Goal</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
