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
    userId: text('user_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_injection_logs_datetime').on(table.datetime),
    index('idx_injection_logs_drug').on(table.drug),
    index('idx_injection_logs_user_id').on(table.userId),
  ],
)

// Migrations tracking table
export const migrations = sqliteTable('_migrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  appliedAt: text('applied_at').notNull(),
})
