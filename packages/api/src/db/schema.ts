import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Better Auth tables
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull(),
  image: text('image'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }),
})

// Weight log entries table
// All weights stored in lbs
export const weightLogs = sqliteTable(
  'weight_logs',
  {
    id: text('id').primaryKey(), // UUID as text
    datetime: text('datetime').notNull(), // ISO8601 string
    weight: real('weight').notNull(), // Always in lbs
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

// User goals table
export const userGoals = sqliteTable(
  'user_goals',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    goalWeight: real('goal_weight').notNull(),
    startingWeight: real('starting_weight').notNull(),
    startingDate: text('starting_date').notNull(),
    targetDate: text('target_date'),
    notes: text('notes'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_user_goals_user_id').on(table.userId), index('idx_user_goals_is_active').on(table.isActive)],
)

// User settings table
export const userSettings = sqliteTable(
  'user_settings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().unique(),
    weightUnit: text('weight_unit', { enum: ['lbs', 'kg'] })
      .notNull()
      .default('lbs'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_user_settings_user_id').on(table.userId)],
)

// Migrations tracking table
export const migrations = sqliteTable('_migrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  appliedAt: text('applied_at').notNull(),
})
