import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Weight log entries table
export const weightLogs = sqliteTable(
  'weight_logs',
  {
    id: text('id').primaryKey(), // UUID as text
    datetime: text('datetime').notNull(), // ISO8601 string
    weight: real('weight').notNull(),
    unit: text('unit', { enum: ['lbs', 'kg'] }).notNull(),
    notes: text('notes'),
    userId: text('user_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_weight_logs_datetime').on(table.datetime), index('idx_weight_logs_user_id').on(table.userId)],
)

// Injection log entries table
export const injectionLogs = sqliteTable(
  'injection_logs',
  {
    id: text('id').primaryKey(), // UUID as text
    datetime: text('datetime').notNull(), // ISO8601 string
    drug: text('drug').notNull(),
    source: text('source'),
    dosage: text('dosage').notNull(),
    injectionSite: text('injection_site'),
    notes: text('notes'),
    scheduleId: text('schedule_id').references(() => injectionSchedules.id, { onDelete: 'set null' }),
    userId: text('user_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_injection_logs_datetime').on(table.datetime),
    index('idx_injection_logs_drug').on(table.drug),
    index('idx_injection_logs_user_id').on(table.userId),
    index('idx_injection_logs_schedule_id').on(table.scheduleId),
  ],
)

// GLP-1 Inventory table
export const glp1Inventory = sqliteTable(
  'glp1_inventory',
  {
    id: text('id').primaryKey(), // UUID as text
    drug: text('drug').notNull(),
    source: text('source').notNull(), // Pharmacy source
    form: text('form', { enum: ['vial', 'pen'] }).notNull(),
    totalAmount: text('total_amount').notNull(), // e.g., "10mg"
    status: text('status', { enum: ['new', 'opened', 'finished'] }).notNull(),
    beyondUseDate: text('beyond_use_date'), // ISO8601 string, optional
    userId: text('user_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_glp1_inventory_user_id').on(table.userId),
    index('idx_glp1_inventory_status').on(table.status),
    index('idx_glp1_inventory_drug').on(table.drug),
  ],
)

// Injection schedules table
export const injectionSchedules = sqliteTable(
  'injection_schedules',
  {
    id: text('id').primaryKey(), // UUID as text
    name: text('name').notNull(),
    drug: text('drug').notNull(),
    source: text('source'),
    frequency: text('frequency', { enum: ['daily', 'every_3_days', 'weekly', 'every_2_weeks', 'monthly'] }).notNull(),
    startDate: text('start_date').notNull(), // ISO8601 string
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    notes: text('notes'),
    userId: text('user_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_injection_schedules_user_id').on(table.userId),
    index('idx_injection_schedules_is_active').on(table.isActive),
  ],
)

// Schedule phases table (for titration steps)
export const schedulePhases = sqliteTable(
  'schedule_phases',
  {
    id: text('id').primaryKey(), // UUID as text
    scheduleId: text('schedule_id')
      .notNull()
      .references(() => injectionSchedules.id, { onDelete: 'cascade' }),
    order: integer('order').notNull(), // 1-based phase order
    durationDays: integer('duration_days'), // How long this phase lasts (NULL = indefinite)
    dosage: text('dosage').notNull(), // e.g., "2.5mg", "10 units"
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_schedule_phases_schedule_id').on(table.scheduleId)],
)

// Migrations tracking table
export const migrations = sqliteTable('_migrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  appliedAt: text('applied_at').notNull(),
})
