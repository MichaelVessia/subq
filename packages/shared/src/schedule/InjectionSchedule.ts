import { Schema } from 'effect'
import { Notes } from '../common/Brand.js'
import { Dosage, DrugName, DrugSource } from '../injection/Brand.js'
import {
  Frequency,
  InjectionScheduleId,
  PhaseDurationDays,
  PhaseOrder,
  ScheduleName,
  SchedulePhaseId,
} from './Brand.js'

// ============================================
// Schedule Phase - a single step in the titration
// ============================================

/**
 * A phase represents one step in a titration schedule.
 * E.g., "Month 1: 10 units weekly" would be one phase.
 */
export class SchedulePhase extends Schema.Class<SchedulePhase>('SchedulePhase')({
  id: SchedulePhaseId,
  scheduleId: InjectionScheduleId,
  order: PhaseOrder,
  durationDays: PhaseDurationDays,
  dosage: Dosage,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export class SchedulePhaseCreate extends Schema.Class<SchedulePhaseCreate>('SchedulePhaseCreate')({
  order: PhaseOrder,
  durationDays: PhaseDurationDays,
  dosage: Dosage,
}) {}

// ============================================
// Injection Schedule - the full schedule with phases
// ============================================

/**
 * An injection schedule tracks a user's prescribed injection regimen.
 * Contains multiple phases for titration schedules.
 */
export class InjectionSchedule extends Schema.Class<InjectionSchedule>('InjectionSchedule')({
  id: InjectionScheduleId,
  name: ScheduleName,
  drug: DrugName,
  source: Schema.NullOr(DrugSource),
  frequency: Frequency,
  startDate: Schema.Date,
  isActive: Schema.Boolean,
  notes: Schema.NullOr(Notes),
  phases: Schema.Array(SchedulePhase),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

/**
 * Payload for creating a new injection schedule.
 */
export class InjectionScheduleCreate extends Schema.Class<InjectionScheduleCreate>('InjectionScheduleCreate')({
  name: ScheduleName,
  drug: DrugName,
  source: Schema.optionalWith(DrugSource, { as: 'Option' }),
  frequency: Frequency,
  startDate: Schema.Date,
  notes: Schema.optionalWith(Notes, { as: 'Option' }),
  phases: Schema.Array(SchedulePhaseCreate),
}) {}

/**
 * Payload for updating an existing injection schedule.
 */
export class InjectionScheduleUpdate extends Schema.Class<InjectionScheduleUpdate>('InjectionScheduleUpdate')({
  id: InjectionScheduleId,
  name: Schema.optional(ScheduleName),
  drug: Schema.optional(DrugName),
  source: Schema.optionalWith(Schema.NullOr(DrugSource), { as: 'Option' }),
  frequency: Schema.optional(Frequency),
  startDate: Schema.optional(Schema.Date),
  isActive: Schema.optional(Schema.Boolean),
  notes: Schema.optionalWith(Schema.NullOr(Notes), { as: 'Option' }),
  phases: Schema.optional(Schema.Array(SchedulePhaseCreate)),
}) {}

/**
 * Payload for deleting an injection schedule.
 */
export class InjectionScheduleDelete extends Schema.Class<InjectionScheduleDelete>('InjectionScheduleDelete')({
  id: InjectionScheduleId,
}) {}

// ============================================
// Next Dose Calculation Types
// ============================================

/**
 * Represents the next scheduled dose for a user.
 */
export class NextScheduledDose extends Schema.Class<NextScheduledDose>('NextScheduledDose')({
  scheduleId: InjectionScheduleId,
  scheduleName: ScheduleName,
  drug: DrugName,
  dosage: Dosage,
  suggestedDate: Schema.Date,
  currentPhase: PhaseOrder,
  totalPhases: Schema.Number,
  daysUntilDue: Schema.Number,
  isOverdue: Schema.Boolean,
}) {}

// ============================================
// Schedule View Types
// ============================================

/**
 * Summary of a completed injection associated with a schedule phase.
 */
export class PhaseInjectionSummary extends Schema.Class<PhaseInjectionSummary>('PhaseInjectionSummary')({
  id: Schema.String,
  datetime: Schema.Date,
  dosage: Dosage,
  injectionSite: Schema.NullOr(Schema.String),
}) {}

/**
 * Progress and details for a single phase in the schedule view.
 */
export class SchedulePhaseView extends Schema.Class<SchedulePhaseView>('SchedulePhaseView')({
  id: SchedulePhaseId,
  order: PhaseOrder,
  durationDays: PhaseDurationDays,
  dosage: Dosage,
  startDate: Schema.Date,
  endDate: Schema.Date,
  status: Schema.Literal('completed', 'current', 'upcoming'),
  expectedInjections: Schema.Number,
  completedInjections: Schema.Number,
  injections: Schema.Array(PhaseInjectionSummary),
}) {}

/**
 * Full schedule view with all phases and their progress.
 */
export class ScheduleView extends Schema.Class<ScheduleView>('ScheduleView')({
  id: InjectionScheduleId,
  name: ScheduleName,
  drug: DrugName,
  source: Schema.NullOr(DrugSource),
  frequency: Frequency,
  startDate: Schema.Date,
  endDate: Schema.Date,
  isActive: Schema.Boolean,
  notes: Schema.NullOr(Notes),
  totalExpectedInjections: Schema.Number,
  totalCompletedInjections: Schema.Number,
  phases: Schema.Array(SchedulePhaseView),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}
