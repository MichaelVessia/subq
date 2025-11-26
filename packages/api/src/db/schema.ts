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

// Migrations tracking table
export const migrations = sqliteTable('_migrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  appliedAt: text('applied_at').notNull(),
})
