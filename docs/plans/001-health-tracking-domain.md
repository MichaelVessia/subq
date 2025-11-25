# Plan 001: Health Tracking Domain

## Overview
Scaffold postgres setup with effect/sql-pg, model weight and injection log entries, establish DB schema and Effect service layer, then build CRUD via UI and RPC.

---

## Phase 1: PostgreSQL Infrastructure

### 1.1 Local PostgreSQL Setup

**Goal:** Get a postgres database running locally that the API can connect to.

**Option A: Add to Nix devShell (Recommended)**

Update `flake.nix`:
```nix
devShells = forAllSystems (pkgs: {
  default = pkgs.mkShell {
    packages = with pkgs; [
      bun
      nodejs_22
      biome
      python3
      postgresql_16  # Add postgres
    ];
    
    # Set up postgres data directory in project
    shellHook = ''
      export PGDATA="$PWD/.postgres/data"
      export PGHOST="$PWD/.postgres"
      export PGDATABASE="scalability_dev"
      
      if [ ! -d "$PGDATA" ]; then
        echo "Initializing PostgreSQL database..."
        initdb --auth=trust --no-locale --encoding=UTF8
      fi
    '';
  };
});
```

Add to `.gitignore`:
```
.postgres/
```

**Commands to run postgres:**
```bash
# Start postgres (in one terminal)
pg_ctl start -l .postgres/log

# Create the database (first time only)
createdb scalability_dev

# Connect to verify
psql -d scalability_dev

# Stop postgres when done
pg_ctl stop
```

**Option B: Docker Compose**

Create `docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: scalability_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

**Decision:** Go with Option A (Nix) for tighter devShell integration. No extra process to manage.

**Environment Variables:**

Create `packages/api/.env.example`:
```
DATABASE_URL=postgres://localhost/scalability_dev
```

Create `packages/api/.env` (gitignored):
```
DATABASE_URL=postgres://localhost/scalability_dev
```

Update `.gitignore`:
```
.env
.postgres/
```

---

### 1.2 Effect SQL Layer Setup

**Goal:** Create a reusable SqlClient layer that can be provided to the application.

**File: `packages/api/src/Sql.ts`**

```typescript
import { PgClient } from "@effect/sql-pg"
import { Config, Layer, Secret } from "effect"

// Configuration for postgres connection
const SqlConfig = Config.all({
  url: Config.string("DATABASE_URL").pipe(
    Config.withDefault("postgres://localhost/scalability_dev")
  ),
})

// Create the postgres client layer
export const SqlLive = PgClient.layerConfig({
  url: Config.map(SqlConfig, (c) => Secret.fromString(c.url)),
})
```

**Why this approach:**
- Uses Effect's Config system for environment variables
- `Secret.fromString` prevents accidental logging of connection string
- `layerConfig` creates a Layer that can be composed with other layers
- Default value allows running without explicit env var in dev

**Wire into `main.ts`:**

```typescript
import { SqlLive } from './Sql.js'

// ... existing code ...

const HttpLive = HttpRouter.Default.serve(HttpMiddleware.cors()).pipe(
  Layer.provide(RpcLive),
  Layer.provide(RpcServer.layerProtocolHttp({ path: '/rpc' })),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3001 })),
  Layer.provide(SqlLive),  // Add SQL layer
)
```

**Verification test:**

Create `packages/api/src/Sql.test.ts`:
```typescript
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { expect, test } from "bun:test"
import { SqlLive } from "./Sql.js"

test("can connect to postgres", async () => {
  const program = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const result = yield* sql`SELECT 1 as num`
    return result[0].num
  })

  const result = await Effect.runPromise(
    program.pipe(Effect.provide(SqlLive))
  )
  
  expect(result).toBe(1)
})
```

---

### 1.3 Migration System

**Goal:** Create a simple, understandable migration system for tracking and applying schema changes.

**Directory structure:**
```
packages/api/
  migrations/
    000_create_migrations_table.sql
    001_create_weight_logs.sql
    002_create_injection_logs.sql
  scripts/
    migrate.ts
```

**File: `packages/api/migrations/000_create_migrations_table.sql`**

```sql
-- Migration tracking table
-- This table records which migrations have been applied
CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**File: `packages/api/scripts/migrate.ts`**

```typescript
import { SqlClient } from "@effect/sql"
import { Effect, Array as Arr } from "effect"
import { SqlLive } from "../src/Sql.js"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

const MIGRATIONS_DIR = join(import.meta.dir, "../migrations")

interface Migration {
  name: string
  sql: string
}

// Load all migration files from disk
const loadMigrations = Effect.tryPromise(async () => {
  const files = await readdir(MIGRATIONS_DIR)
  const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort()
  
  const migrations: Migration[] = []
  for (const file of sqlFiles) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf-8")
    migrations.push({ name: file, sql })
  }
  return migrations
})

// Get list of already-applied migrations from database
const getAppliedMigrations = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  
  // First ensure the migrations table exists
  yield* sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  
  const rows = yield* sql<{ name: string }>`
    SELECT name FROM _migrations ORDER BY name
  `
  return rows.map((r) => r.name)
})

// Apply a single migration
const applyMigration = (migration: Migration) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    
    console.log(`Applying migration: ${migration.name}`)
    
    // Run the migration SQL
    yield* sql.unsafe(migration.sql)
    
    // Record that we applied it
    yield* sql`
      INSERT INTO _migrations (name) VALUES (${migration.name})
    `
    
    console.log(`  ✓ Applied successfully`)
  })

// Main migration program
const migrate = Effect.gen(function* () {
  const allMigrations = yield* loadMigrations
  const appliedNames = yield* getAppliedMigrations
  
  const pending = allMigrations.filter(
    (m) => !appliedNames.includes(m.name)
  )
  
  if (pending.length === 0) {
    console.log("No pending migrations.")
    return
  }
  
  console.log(`Found ${pending.length} pending migration(s):\n`)
  
  for (const migration of pending) {
    yield* applyMigration(migration)
  }
  
  console.log(`\nAll migrations applied!`)
})

// Run it
Effect.runPromise(migrate.pipe(Effect.provide(SqlLive)))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err)
    process.exit(1)
  })
```

**Add script to package.json:**

```json
{
  "scripts": {
    "dev": "bun run --watch src/main.ts",
    "migrate": "bun run scripts/migrate.ts"
  }
}
```

**Usage:**
```bash
# Run all pending migrations
bun run --filter @scale/api migrate

# Or from packages/api directory
bun run migrate
```

**How migrations work:**
1. Script reads all `.sql` files from `migrations/` folder
2. Checks `_migrations` table for which ones are already applied
3. Applies any pending migrations in alphabetical order
4. Records each successful migration in `_migrations` table

**Best practices:**
- Never edit a migration after it's been applied
- Name migrations with numeric prefix: `001_`, `002_`, etc.
- Each migration should be idempotent where possible (use `IF NOT EXISTS`)
- Keep migrations small and focused

---

## Phase 2: Domain Modeling

### 2.1 Shared Domain Types

**Goal:** Define TypeScript types using Effect Schema that can be used by both frontend and backend. These provide runtime validation and type safety.

**File structure:**
```
packages/shared/src/
  domain/
    WeightLog.ts
    InjectionLog.ts
    index.ts
  index.ts
  Rpc.ts
```

---

### 2.2 Weight Log Domain

**File: `packages/shared/src/domain/WeightLog.ts`**

```typescript
import { Schema } from "effect"

// ============================================
// Enums / Literals
// ============================================

/**
 * Supported weight units.
 * - "lbs" = pounds (US)
 * - "kg" = kilograms (metric)
 */
export const WeightUnit = Schema.Literal("lbs", "kg")
export type WeightUnit = typeof WeightUnit.Type

// ============================================
// Core Domain Type
// ============================================

/**
 * A weight log entry represents a single weight measurement.
 * 
 * @property id - UUID, generated by database
 * @property datetime - When the measurement was taken
 * @property weight - The weight value (e.g., 185.5)
 * @property unit - The unit of measurement (lbs or kg)
 * @property notes - Optional free-text notes
 * @property createdAt - When this record was created
 * @property updatedAt - When this record was last modified
 */
export class WeightLog extends Schema.Class<WeightLog>("WeightLog")({
  id: Schema.String,
  datetime: Schema.Date,
  weight: Schema.Number,
  unit: WeightUnit,
  notes: Schema.NullOr(Schema.String),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

// ============================================
// Input Types (for create/update operations)
// ============================================

/**
 * Payload for creating a new weight log entry.
 * id, createdAt, updatedAt are generated server-side.
 */
export class WeightLogCreate extends Schema.Class<WeightLogCreate>("WeightLogCreate")({
  datetime: Schema.Date,
  weight: Schema.Number,
  unit: WeightUnit,
  notes: Schema.optionalWith(Schema.String, { as: "Option" }),
}) {}

/**
 * Payload for updating an existing weight log entry.
 * All fields optional - only provided fields are updated.
 */
export class WeightLogUpdate extends Schema.Class<WeightLogUpdate>("WeightLogUpdate")({
  id: Schema.String,
  datetime: Schema.optional(Schema.Date),
  weight: Schema.optional(Schema.Number),
  unit: Schema.optional(WeightUnit),
  notes: Schema.optionalWith(Schema.NullOr(Schema.String), { as: "Option" }),
}) {}

/**
 * Payload for deleting a weight log entry.
 */
export class WeightLogDelete extends Schema.Class<WeightLogDelete>("WeightLogDelete")({
  id: Schema.String,
}) {}

// ============================================
// Query Types
// ============================================

/**
 * Parameters for listing weight logs.
 * Supports pagination and date filtering.
 */
export class WeightLogListParams extends Schema.Class<WeightLogListParams>("WeightLogListParams")({
  limit: Schema.optionalWith(Schema.Number, { default: () => 50 }),
  offset: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  startDate: Schema.optional(Schema.Date),
  endDate: Schema.optional(Schema.Date),
}) {}
```

**Explanation of Schema patterns:**

- `Schema.Class` - Creates a class with both runtime validation and TypeScript types
- `Schema.NullOr(X)` - Value can be X or null (for nullable DB columns)
- `Schema.optionalWith(X, { as: "Option" })` - Field is optional, represented as Option type
- `Schema.optional(X)` - Field is optional, represented as `X | undefined`

---

### 2.3 Injection Log Domain

**File: `packages/shared/src/domain/InjectionLog.ts`**

```typescript
import { Schema } from "effect"

// ============================================
// Core Domain Type
// ============================================

/**
 * An injection log entry represents a single injection event.
 * Used for tracking medication injections (TRT, peptides, etc.)
 * 
 * @property id - UUID, generated by database
 * @property datetime - When the injection was administered
 * @property drug - Name of the drug/compound (e.g., "Testosterone Cypionate")
 * @property source - Where the drug came from (e.g., "CVS", "Empower Pharmacy")
 * @property dosage - Amount injected as string (e.g., "200mg", "0.5ml")
 * @property injectionSite - Body location (e.g., "left ventrogluteal", "right deltoid")
 * @property notes - Optional free-text notes
 * @property createdAt - When this record was created
 * @property updatedAt - When this record was last modified
 */
export class InjectionLog extends Schema.Class<InjectionLog>("InjectionLog")({
  id: Schema.String,
  datetime: Schema.Date,
  drug: Schema.String,
  source: Schema.NullOr(Schema.String),
  dosage: Schema.String,
  injectionSite: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

// ============================================
// Input Types
// ============================================

/**
 * Payload for creating a new injection log entry.
 */
export class InjectionLogCreate extends Schema.Class<InjectionLogCreate>("InjectionLogCreate")({
  datetime: Schema.Date,
  drug: Schema.String,
  source: Schema.optionalWith(Schema.String, { as: "Option" }),
  dosage: Schema.String,
  injectionSite: Schema.optionalWith(Schema.String, { as: "Option" }),
  notes: Schema.optionalWith(Schema.String, { as: "Option" }),
}) {}

/**
 * Payload for updating an existing injection log entry.
 */
export class InjectionLogUpdate extends Schema.Class<InjectionLogUpdate>("InjectionLogUpdate")({
  id: Schema.String,
  datetime: Schema.optional(Schema.Date),
  drug: Schema.optional(Schema.String),
  source: Schema.optionalWith(Schema.NullOr(Schema.String), { as: "Option" }),
  dosage: Schema.optional(Schema.String),
  injectionSite: Schema.optionalWith(Schema.NullOr(Schema.String), { as: "Option" }),
  notes: Schema.optionalWith(Schema.NullOr(Schema.String), { as: "Option" }),
}) {}

/**
 * Payload for deleting an injection log entry.
 */
export class InjectionLogDelete extends Schema.Class<InjectionLogDelete>("InjectionLogDelete")({
  id: Schema.String,
}) {}

/**
 * Parameters for listing injection logs.
 */
export class InjectionLogListParams extends Schema.Class<InjectionLogListParams>("InjectionLogListParams")({
  limit: Schema.optionalWith(Schema.Number, { default: () => 50 }),
  offset: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  startDate: Schema.optional(Schema.Date),
  endDate: Schema.optional(Schema.Date),
  drug: Schema.optional(Schema.String), // Filter by specific drug
}) {}
```

---

### 2.4 Domain Index File

**File: `packages/shared/src/domain/index.ts`**

```typescript
export * from "./WeightLog.js"
export * from "./InjectionLog.js"
```

**Update: `packages/shared/src/index.ts`**

```typescript
export * from "./Rpc.js"
export * from "./domain/index.js"
```

---

### 2.5 Database Migrations

**File: `packages/api/migrations/001_create_weight_logs.sql`**

```sql
-- Weight log entries table
-- Stores individual weight measurements over time

CREATE TABLE weight_logs (
  -- Primary key: UUID generated by postgres
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- When the weight was measured (user-provided, with timezone)
  datetime TIMESTAMPTZ NOT NULL,
  
  -- The weight value, up to 9999.99
  weight NUMERIC(6,2) NOT NULL,
  
  -- Unit of measurement, constrained to valid values
  unit VARCHAR(3) NOT NULL CHECK (unit IN ('lbs', 'kg')),
  
  -- Optional notes
  notes TEXT,
  
  -- Audit timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient date-based queries (most recent first)
CREATE INDEX idx_weight_logs_datetime ON weight_logs(datetime DESC);

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_weight_logs_updated_at
  BEFORE UPDATE ON weight_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**File: `packages/api/migrations/002_create_injection_logs.sql`**

```sql
-- Injection log entries table
-- Stores individual injection events for medication tracking

CREATE TABLE injection_logs (
  -- Primary key: UUID generated by postgres
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- When the injection was administered
  datetime TIMESTAMPTZ NOT NULL,
  
  -- Name of the drug/compound
  drug VARCHAR(255) NOT NULL,
  
  -- Source/pharmacy (optional)
  source VARCHAR(255),
  
  -- Dosage as string (e.g., "200mg", "0.5ml")
  dosage VARCHAR(100) NOT NULL,
  
  -- Body location of injection (optional)
  injection_site VARCHAR(100),
  
  -- Optional notes
  notes TEXT,
  
  -- Audit timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient date-based queries
CREATE INDEX idx_injection_logs_datetime ON injection_logs(datetime DESC);

-- Index for filtering by drug name
CREATE INDEX idx_injection_logs_drug ON injection_logs(drug);

-- Use the same updated_at trigger function from weight_logs migration
CREATE TRIGGER update_injection_logs_updated_at
  BEFORE UPDATE ON injection_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## Phase 3: Effect Service Layer (Repositories)

### 3.1 Repository Pattern Overview

**Goal:** Create a data access layer that encapsulates all database operations. This keeps SQL queries out of RPC handlers and makes testing easier.

**Pattern:**
- Each domain entity gets a Repository service
- Repository is an Effect Tag (dependency injection)
- Implementation uses SqlClient from @effect/sql
- Layer composition connects everything

---

### 3.2 Weight Log Repository

**File: `packages/api/src/repositories/WeightLogRepo.ts`**

```typescript
import { SqlClient, SqlSchema } from "@effect/sql"
import { Effect, Layer, Option, Array as Arr } from "effect"
import { Schema } from "effect"
import { 
  WeightLog, 
  WeightLogCreate, 
  WeightLogUpdate,
  WeightLogListParams 
} from "@scale/shared"

// ============================================
// Database Row Schema
// ============================================

// Schema for rows as they come from the database
// (snake_case columns, Date objects from pg driver)
const WeightLogRow = Schema.Struct({
  id: Schema.String,
  datetime: Schema.Date,
  weight: Schema.NumberFromString, // NUMERIC comes as string from pg
  unit: Schema.Literal("lbs", "kg"),
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.Date,
  updated_at: Schema.Date,
})

// Transform DB row to domain object
const rowToDomain = (row: typeof WeightLogRow.Type): WeightLog =>
  new WeightLog({
    id: row.id,
    datetime: row.datetime,
    weight: row.weight,
    unit: row.unit,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })

// ============================================
// Repository Service Definition
// ============================================

export class WeightLogRepo extends Effect.Tag("WeightLogRepo")<
  WeightLogRepo,
  {
    /**
     * List weight logs with optional pagination and filtering.
     */
    readonly list: (params: WeightLogListParams) => Effect.Effect<WeightLog[]>
    
    /**
     * Find a single weight log by ID.
     * Returns Option.none() if not found.
     */
    readonly findById: (id: string) => Effect.Effect<Option.Option<WeightLog>>
    
    /**
     * Create a new weight log entry.
     * Returns the created entry with generated id and timestamps.
     */
    readonly create: (data: WeightLogCreate) => Effect.Effect<WeightLog>
    
    /**
     * Update an existing weight log entry.
     * Returns the updated entry, or fails if not found.
     */
    readonly update: (data: WeightLogUpdate) => Effect.Effect<WeightLog>
    
    /**
     * Delete a weight log entry by ID.
     * Returns true if deleted, false if not found.
     */
    readonly delete: (id: string) => Effect.Effect<boolean>
  }
>() {}

// ============================================
// Repository Implementation
// ============================================

export const WeightLogRepoLive = Layer.effect(
  WeightLogRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return {
      list: (params) =>
        Effect.gen(function* () {
          // Build query with optional filters
          const rows = yield* sql<typeof WeightLogRow.Type>`
            SELECT id, datetime, weight, unit, notes, created_at, updated_at
            FROM weight_logs
            WHERE 1=1
            ${params.startDate ? sql`AND datetime >= ${params.startDate}` : sql``}
            ${params.endDate ? sql`AND datetime <= ${params.endDate}` : sql``}
            ORDER BY datetime DESC
            LIMIT ${params.limit}
            OFFSET ${params.offset}
          `
          return rows.map(rowToDomain)
        }),

      findById: (id) =>
        Effect.gen(function* () {
          const rows = yield* sql<typeof WeightLogRow.Type>`
            SELECT id, datetime, weight, unit, notes, created_at, updated_at
            FROM weight_logs
            WHERE id = ${id}
          `
          return Arr.head(rows).pipe(Option.map(rowToDomain))
        }),

      create: (data) =>
        Effect.gen(function* () {
          const notes = Option.isSome(data.notes) ? data.notes.value : null
          
          const rows = yield* sql<typeof WeightLogRow.Type>`
            INSERT INTO weight_logs (datetime, weight, unit, notes)
            VALUES (${data.datetime}, ${data.weight}, ${data.unit}, ${notes})
            RETURNING id, datetime, weight, unit, notes, created_at, updated_at
          `
          return rowToDomain(rows[0])
        }),

      update: (data) =>
        Effect.gen(function* () {
          // Build dynamic UPDATE with only provided fields
          const setClauses: string[] = []
          const values: unknown[] = []
          
          if (data.datetime !== undefined) {
            setClauses.push("datetime = $" + (values.length + 1))
            values.push(data.datetime)
          }
          if (data.weight !== undefined) {
            setClauses.push("weight = $" + (values.length + 1))
            values.push(data.weight)
          }
          if (data.unit !== undefined) {
            setClauses.push("unit = $" + (values.length + 1))
            values.push(data.unit)
          }
          if (Option.isSome(data.notes)) {
            setClauses.push("notes = $" + (values.length + 1))
            values.push(data.notes.value)
          }
          
          if (setClauses.length === 0) {
            // No fields to update, just return current
            const current = yield* WeightLogRepo.findById(data.id)
            return Option.getOrThrowWith(current, () => new Error("Not found"))
          }
          
          const rows = yield* sql<typeof WeightLogRow.Type>`
            UPDATE weight_logs
            SET datetime = COALESCE(${data.datetime}, datetime),
                weight = COALESCE(${data.weight}, weight),
                unit = COALESCE(${data.unit}, unit),
                notes = ${Option.isSome(data.notes) ? data.notes.value : sql`notes`}
            WHERE id = ${data.id}
            RETURNING id, datetime, weight, unit, notes, created_at, updated_at
          `
          
          if (rows.length === 0) {
            return yield* Effect.fail(new Error("WeightLog not found"))
          }
          
          return rowToDomain(rows[0])
        }),

      delete: (id) =>
        Effect.gen(function* () {
          const result = yield* sql`
            DELETE FROM weight_logs WHERE id = ${id}
          `
          return result.length > 0
        }),
    }
  })
)
```

---

### 3.3 Injection Log Repository

**File: `packages/api/src/repositories/InjectionLogRepo.ts`**

```typescript
import { SqlClient } from "@effect/sql"
import { Effect, Layer, Option, Array as Arr } from "effect"
import { Schema } from "effect"
import {
  InjectionLog,
  InjectionLogCreate,
  InjectionLogUpdate,
  InjectionLogListParams,
} from "@scale/shared"

// ============================================
// Database Row Schema
// ============================================

const InjectionLogRow = Schema.Struct({
  id: Schema.String,
  datetime: Schema.Date,
  drug: Schema.String,
  source: Schema.NullOr(Schema.String),
  dosage: Schema.String,
  injection_site: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  created_at: Schema.Date,
  updated_at: Schema.Date,
})

const rowToDomain = (row: typeof InjectionLogRow.Type): InjectionLog =>
  new InjectionLog({
    id: row.id,
    datetime: row.datetime,
    drug: row.drug,
    source: row.source,
    dosage: row.dosage,
    injectionSite: row.injection_site,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })

// ============================================
// Repository Service Definition
// ============================================

export class InjectionLogRepo extends Effect.Tag("InjectionLogRepo")<
  InjectionLogRepo,
  {
    readonly list: (params: InjectionLogListParams) => Effect.Effect<InjectionLog[]>
    readonly findById: (id: string) => Effect.Effect<Option.Option<InjectionLog>>
    readonly create: (data: InjectionLogCreate) => Effect.Effect<InjectionLog>
    readonly update: (data: InjectionLogUpdate) => Effect.Effect<InjectionLog>
    readonly delete: (id: string) => Effect.Effect<boolean>
    
    /**
     * Get list of unique drug names for autocomplete.
     */
    readonly getUniqueDrugs: () => Effect.Effect<string[]>
    
    /**
     * Get list of unique injection sites for autocomplete.
     */
    readonly getUniqueSites: () => Effect.Effect<string[]>
  }
>() {}

// ============================================
// Repository Implementation
// ============================================

export const InjectionLogRepoLive = Layer.effect(
  InjectionLogRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return {
      list: (params) =>
        Effect.gen(function* () {
          const rows = yield* sql<typeof InjectionLogRow.Type>`
            SELECT id, datetime, drug, source, dosage, injection_site, notes, created_at, updated_at
            FROM injection_logs
            WHERE 1=1
            ${params.startDate ? sql`AND datetime >= ${params.startDate}` : sql``}
            ${params.endDate ? sql`AND datetime <= ${params.endDate}` : sql``}
            ${params.drug ? sql`AND drug = ${params.drug}` : sql``}
            ORDER BY datetime DESC
            LIMIT ${params.limit}
            OFFSET ${params.offset}
          `
          return rows.map(rowToDomain)
        }),

      findById: (id) =>
        Effect.gen(function* () {
          const rows = yield* sql<typeof InjectionLogRow.Type>`
            SELECT id, datetime, drug, source, dosage, injection_site, notes, created_at, updated_at
            FROM injection_logs
            WHERE id = ${id}
          `
          return Arr.head(rows).pipe(Option.map(rowToDomain))
        }),

      create: (data) =>
        Effect.gen(function* () {
          const source = Option.isSome(data.source) ? data.source.value : null
          const injectionSite = Option.isSome(data.injectionSite) ? data.injectionSite.value : null
          const notes = Option.isSome(data.notes) ? data.notes.value : null

          const rows = yield* sql<typeof InjectionLogRow.Type>`
            INSERT INTO injection_logs (datetime, drug, source, dosage, injection_site, notes)
            VALUES (${data.datetime}, ${data.drug}, ${source}, ${data.dosage}, ${injectionSite}, ${notes})
            RETURNING id, datetime, drug, source, dosage, injection_site, notes, created_at, updated_at
          `
          return rowToDomain(rows[0])
        }),

      update: (data) =>
        Effect.gen(function* () {
          const rows = yield* sql<typeof InjectionLogRow.Type>`
            UPDATE injection_logs
            SET datetime = COALESCE(${data.datetime}, datetime),
                drug = COALESCE(${data.drug}, drug),
                source = ${Option.isSome(data.source) ? data.source.value : sql`source`},
                dosage = COALESCE(${data.dosage}, dosage),
                injection_site = ${Option.isSome(data.injectionSite) ? data.injectionSite.value : sql`injection_site`},
                notes = ${Option.isSome(data.notes) ? data.notes.value : sql`notes`}
            WHERE id = ${data.id}
            RETURNING id, datetime, drug, source, dosage, injection_site, notes, created_at, updated_at
          `

          if (rows.length === 0) {
            return yield* Effect.fail(new Error("InjectionLog not found"))
          }

          return rowToDomain(rows[0])
        }),

      delete: (id) =>
        Effect.gen(function* () {
          const result = yield* sql`
            DELETE FROM injection_logs WHERE id = ${id}
          `
          return result.length > 0
        }),

      getUniqueDrugs: () =>
        Effect.gen(function* () {
          const rows = yield* sql<{ drug: string }>`
            SELECT DISTINCT drug FROM injection_logs ORDER BY drug
          `
          return rows.map((r) => r.drug)
        }),

      getUniqueSites: () =>
        Effect.gen(function* () {
          const rows = yield* sql<{ injection_site: string }>`
            SELECT DISTINCT injection_site 
            FROM injection_logs 
            WHERE injection_site IS NOT NULL 
            ORDER BY injection_site
          `
          return rows.map((r) => r.injection_site)
        }),
    }
  })
)
```

---

### 3.4 Repository Index

**File: `packages/api/src/repositories/index.ts`**

```typescript
import { Layer } from "effect"
import { WeightLogRepoLive } from "./WeightLogRepo.js"
import { InjectionLogRepoLive } from "./InjectionLogRepo.js"

export * from "./WeightLogRepo.js"
export * from "./InjectionLogRepo.js"

// Combined layer for all repositories
export const RepositoriesLive = Layer.mergeAll(
  WeightLogRepoLive,
  InjectionLogRepoLive
)
```

---

## Phase 4: RPC Layer

### 4.1 RPC Group Definitions

**Goal:** Define the RPC interface in shared package so both client and server have type-safe contracts.

**Update: `packages/shared/src/Rpc.ts`**

```typescript
import { Rpc, RpcGroup } from "@effect/rpc"
import { Schema } from "effect"
import {
  WeightLog,
  WeightLogCreate,
  WeightLogUpdate,
  WeightLogDelete,
  WeightLogListParams,
  InjectionLog,
  InjectionLogCreate,
  InjectionLogUpdate,
  InjectionLogDelete,
  InjectionLogListParams,
} from "./domain/index.js"

// ============================================
// Weight Log RPC
// ============================================

export class WeightLogRpcs extends RpcGroup.make(
  // List weight logs with pagination/filtering
  Rpc.make("WeightLogList", {
    payload: WeightLogListParams,
    success: Schema.Array(WeightLog),
  }),
  
  // Get single weight log by ID
  Rpc.make("WeightLogGet", {
    payload: Schema.Struct({ id: Schema.String }),
    success: Schema.NullOr(WeightLog),
  }),
  
  // Create new weight log
  Rpc.make("WeightLogCreate", {
    payload: WeightLogCreate,
    success: WeightLog,
  }),
  
  // Update existing weight log
  Rpc.make("WeightLogUpdate", {
    payload: WeightLogUpdate,
    success: WeightLog,
  }),
  
  // Delete weight log
  Rpc.make("WeightLogDelete", {
    payload: WeightLogDelete,
    success: Schema.Boolean, // true if deleted
  }),
) {}

// ============================================
// Injection Log RPC
// ============================================

export class InjectionLogRpcs extends RpcGroup.make(
  Rpc.make("InjectionLogList", {
    payload: InjectionLogListParams,
    success: Schema.Array(InjectionLog),
  }),
  
  Rpc.make("InjectionLogGet", {
    payload: Schema.Struct({ id: Schema.String }),
    success: Schema.NullOr(InjectionLog),
  }),
  
  Rpc.make("InjectionLogCreate", {
    payload: InjectionLogCreate,
    success: InjectionLog,
  }),
  
  Rpc.make("InjectionLogUpdate", {
    payload: InjectionLogUpdate,
    success: InjectionLog,
  }),
  
  Rpc.make("InjectionLogDelete", {
    payload: InjectionLogDelete,
    success: Schema.Boolean,
  }),
  
  // Utility: get unique drug names for autocomplete
  Rpc.make("InjectionLogGetDrugs", {
    success: Schema.Array(Schema.String),
  }),
  
  // Utility: get unique injection sites for autocomplete
  Rpc.make("InjectionLogGetSites", {
    success: Schema.Array(Schema.String),
  }),
) {}

// ============================================
// Combined App RPCs
// ============================================

// Keep existing Greet RPC and add new ones
export class AppRpcs extends RpcGroup.make(
  Rpc.make("Greet", {
    success: Schema.String,
    payload: { name: Schema.String },
  }),
).pipe(
  RpcGroup.merge(WeightLogRpcs),
  RpcGroup.merge(InjectionLogRpcs),
) {}
```

---

### 4.2 RPC Handlers

**Update: `packages/api/src/RpcHandlers.ts`**

```typescript
import { Rpc } from "@effect/rpc"
import { Effect, Layer, Option } from "effect"
import { AppRpcs } from "@scale/shared"
import { WeightLogRepo } from "./repositories/WeightLogRepo.js"
import { InjectionLogRepo } from "./repositories/InjectionLogRepo.js"
import { Greeter } from "./Greeter.js"

// ============================================
// Existing Handlers
// ============================================

const GreetHandler = Rpc.handler(AppRpcs, "Greet", ({ name }) =>
  Greeter.greet(name)
)

// ============================================
// Weight Log Handlers
// ============================================

const WeightLogListHandler = Rpc.handler(AppRpcs, "WeightLogList", (params) =>
  Effect.gen(function* () {
    const repo = yield* WeightLogRepo
    return yield* repo.list(params)
  })
)

const WeightLogGetHandler = Rpc.handler(AppRpcs, "WeightLogGet", ({ id }) =>
  Effect.gen(function* () {
    const repo = yield* WeightLogRepo
    const result = yield* repo.findById(id)
    return Option.getOrNull(result)
  })
)

const WeightLogCreateHandler = Rpc.handler(AppRpcs, "WeightLogCreate", (data) =>
  Effect.gen(function* () {
    const repo = yield* WeightLogRepo
    return yield* repo.create(data)
  })
)

const WeightLogUpdateHandler = Rpc.handler(AppRpcs, "WeightLogUpdate", (data) =>
  Effect.gen(function* () {
    const repo = yield* WeightLogRepo
    return yield* repo.update(data)
  })
)

const WeightLogDeleteHandler = Rpc.handler(AppRpcs, "WeightLogDelete", ({ id }) =>
  Effect.gen(function* () {
    const repo = yield* WeightLogRepo
    return yield* repo.delete(id)
  })
)

// ============================================
// Injection Log Handlers
// ============================================

const InjectionLogListHandler = Rpc.handler(AppRpcs, "InjectionLogList", (params) =>
  Effect.gen(function* () {
    const repo = yield* InjectionLogRepo
    return yield* repo.list(params)
  })
)

const InjectionLogGetHandler = Rpc.handler(AppRpcs, "InjectionLogGet", ({ id }) =>
  Effect.gen(function* () {
    const repo = yield* InjectionLogRepo
    const result = yield* repo.findById(id)
    return Option.getOrNull(result)
  })
)

const InjectionLogCreateHandler = Rpc.handler(AppRpcs, "InjectionLogCreate", (data) =>
  Effect.gen(function* () {
    const repo = yield* InjectionLogRepo
    return yield* repo.create(data)
  })
)

const InjectionLogUpdateHandler = Rpc.handler(AppRpcs, "InjectionLogUpdate", (data) =>
  Effect.gen(function* () {
    const repo = yield* InjectionLogRepo
    return yield* repo.update(data)
  })
)

const InjectionLogDeleteHandler = Rpc.handler(AppRpcs, "InjectionLogDelete", ({ id }) =>
  Effect.gen(function* () {
    const repo = yield* InjectionLogRepo
    return yield* repo.delete(id)
  })
)

const InjectionLogGetDrugsHandler = Rpc.handler(AppRpcs, "InjectionLogGetDrugs", () =>
  Effect.gen(function* () {
    const repo = yield* InjectionLogRepo
    return yield* repo.getUniqueDrugs()
  })
)

const InjectionLogGetSitesHandler = Rpc.handler(AppRpcs, "InjectionLogGetSites", () =>
  Effect.gen(function* () {
    const repo = yield* InjectionLogRepo
    return yield* repo.getUniqueSites()
  })
)

// ============================================
// Combined Handler Layer
// ============================================

export const RpcHandlersLive = Layer.mergeAll(
  // Existing
  GreetHandler,
  
  // Weight Log
  WeightLogListHandler,
  WeightLogGetHandler,
  WeightLogCreateHandler,
  WeightLogUpdateHandler,
  WeightLogDeleteHandler,
  
  // Injection Log
  InjectionLogListHandler,
  InjectionLogGetHandler,
  InjectionLogCreateHandler,
  InjectionLogUpdateHandler,
  InjectionLogDeleteHandler,
  InjectionLogGetDrugsHandler,
  InjectionLogGetSitesHandler,
)
```

---

### 4.3 Wire Everything in main.ts

**Update: `packages/api/src/main.ts`**

```typescript
import { HttpMiddleware, HttpRouter } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { RpcSerialization, RpcServer } from "@effect/rpc"
import { AppRpcs } from "@scale/shared"
import { Layer } from "effect"
import { createServer } from "node:http"
import { RpcHandlersLive } from "./RpcHandlers.js"
import { SqlLive } from "./Sql.js"
import { RepositoriesLive } from "./repositories/index.js"

// RPC server layer
const RpcLive = RpcServer.layer(AppRpcs).pipe(
  Layer.provide(RpcHandlersLive)
)

// HTTP server with all dependencies
const HttpLive = HttpRouter.Default.serve(HttpMiddleware.cors()).pipe(
  Layer.provide(RpcLive),
  Layer.provide(RpcServer.layerProtocolHttp({ path: "/rpc" })),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3001 })),
  // Provide repositories to handlers
  Layer.provide(RepositoriesLive),
  // Provide SQL client to repositories
  Layer.provide(SqlLive),
)

NodeRuntime.runMain(Layer.launch(HttpLive))
```

---

## Phase 5: UI Layer

### 5.1 Overview

**Goal:** Build React components for viewing and managing weight and injection logs.

**File structure:**
```
packages/web/src/
  components/
    weight/
      WeightLogList.tsx
      WeightLogForm.tsx
      WeightLogCard.tsx
    injection/
      InjectionLogList.tsx
      InjectionLogForm.tsx
      InjectionLogCard.tsx
    ui/
      Button.tsx
      Input.tsx
      DateTimePicker.tsx
      Select.tsx
      Modal.tsx
  hooks/
    useWeightLogs.ts
    useInjectionLogs.ts
  pages/
    WeightPage.tsx
    InjectionPage.tsx
  App.tsx
```

---

### 5.2 RPC Client Setup

**Update: `packages/web/src/rpc.ts`**

```typescript
import { RpcClient, RpcSerialization } from "@effect/rpc"
import { FetchHttpClient } from "@effect/platform"
import { Effect, Layer } from "effect"
import { AppRpcs } from "@scale/shared"

// Create RPC client layer
const RpcClientLive = RpcClient.layer(AppRpcs).pipe(
  Layer.provide(RpcClient.layerProtocolHttp({ url: "http://localhost:3001/rpc" })),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(FetchHttpClient.layer),
)

// Helper to run RPC calls
export const runRpc = <A, E>(effect: Effect.Effect<A, E, RpcClient.RpcClient<AppRpcs>>) =>
  Effect.runPromise(effect.pipe(Effect.provide(RpcClientLive)))

// Typed client accessor
export const useRpcClient = () => {
  return {
    // Weight logs
    weightLog: {
      list: (params = {}) =>
        runRpc(
          Effect.gen(function* () {
            const client = yield* RpcClient.RpcClient<AppRpcs>
            return yield* client.WeightLogList(params)
          })
        ),
      get: (id: string) =>
        runRpc(
          Effect.gen(function* () {
            const client = yield* RpcClient.RpcClient<AppRpcs>
            return yield* client.WeightLogGet({ id })
          })
        ),
      create: (data) =>
        runRpc(
          Effect.gen(function* () {
            const client = yield* RpcClient.RpcClient<AppRpcs>
            return yield* client.WeightLogCreate(data)
          })
        ),
      update: (data) =>
        runRpc(
          Effect.gen(function* () {
            const client = yield* RpcClient.RpcClient<AppRpcs>
            return yield* client.WeightLogUpdate(data)
          })
        ),
      delete: (id: string) =>
        runRpc(
          Effect.gen(function* () {
            const client = yield* RpcClient.RpcClient<AppRpcs>
            return yield* client.WeightLogDelete({ id })
          })
        ),
    },
    
    // Injection logs
    injectionLog: {
      list: (params = {}) =>
        runRpc(
          Effect.gen(function* () {
            const client = yield* RpcClient.RpcClient<AppRpcs>
            return yield* client.InjectionLogList(params)
          })
        ),
      get: (id: string) =>
        runRpc(
          Effect.gen(function* () {
            const client = yield* RpcClient.RpcClient<AppRpcs>
            return yield* client.InjectionLogGet({ id })
          })
        ),
      create: (data) =>
        runRpc(
          Effect.gen(function* () {
            const client = yield* RpcClient.RpcClient<AppRpcs>
            return yield* client.InjectionLogCreate(data)
          })
        ),
      update: (data) =>
        runRpc(
          Effect.gen(function* () {
            const client = yield* RpcClient.RpcClient<AppRpcs>
            return yield* client.InjectionLogUpdate(data)
          })
        ),
      delete: (id: string) =>
        runRpc(
          Effect.gen(function* () {
            const client = yield* RpcClient.RpcClient<AppRpcs>
            return yield* client.InjectionLogDelete({ id })
          })
        ),
      getDrugs: () =>
        runRpc(
          Effect.gen(function* () {
            const client = yield* RpcClient.RpcClient<AppRpcs>
            return yield* client.InjectionLogGetDrugs()
          })
        ),
      getSites: () =>
        runRpc(
          Effect.gen(function* () {
            const client = yield* RpcClient.RpcClient<AppRpcs>
            return yield* client.InjectionLogGetSites()
          })
        ),
    },
  }
}
```

---

### 5.3 Weight Log Components

**File: `packages/web/src/components/weight/WeightLogForm.tsx`**

```tsx
import { useState } from "react"
import { Option } from "effect"
import { WeightLogCreate, WeightUnit } from "@scale/shared"

interface WeightLogFormProps {
  onSubmit: (data: WeightLogCreate) => Promise<void>
  onCancel: () => void
  initialData?: Partial<WeightLogCreate>
}

export function WeightLogForm({ onSubmit, onCancel, initialData }: WeightLogFormProps) {
  const [datetime, setDatetime] = useState(
    initialData?.datetime?.toISOString().slice(0, 16) ?? 
    new Date().toISOString().slice(0, 16)
  )
  const [weight, setWeight] = useState(initialData?.weight?.toString() ?? "")
  const [unit, setUnit] = useState<WeightUnit>(initialData?.unit ?? "lbs")
  const [notes, setNotes] = useState(
    Option.isSome(initialData?.notes) ? initialData.notes.value : ""
  )
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      await onSubmit(
        new WeightLogCreate({
          datetime: new Date(datetime),
          weight: parseFloat(weight),
          unit,
          notes: notes ? Option.some(notes) : Option.none(),
        })
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="datetime" className="block text-sm font-medium">
          Date & Time
        </label>
        <input
          type="datetime-local"
          id="datetime"
          value={datetime}
          onChange={(e) => setDatetime(e.target.value)}
          required
          className="mt-1 block w-full rounded border p-2"
        />
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label htmlFor="weight" className="block text-sm font-medium">
            Weight
          </label>
          <input
            type="number"
            id="weight"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            step="0.1"
            min="0"
            required
            className="mt-1 block w-full rounded border p-2"
          />
        </div>

        <div>
          <label htmlFor="unit" className="block text-sm font-medium">
            Unit
          </label>
          <select
            id="unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as WeightUnit)}
            className="mt-1 block rounded border p-2"
          >
            <option value="lbs">lbs</option>
            <option value="kg">kg</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded border p-2"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border rounded"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  )
}
```

**File: `packages/web/src/components/weight/WeightLogList.tsx`**

```tsx
import { useState, useEffect } from "react"
import { WeightLog } from "@scale/shared"
import { useRpcClient } from "../../rpc"
import { WeightLogForm } from "./WeightLogForm"

export function WeightLogList() {
  const rpc = useRpcClient()
  const [logs, setLogs] = useState<WeightLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const loadLogs = async () => {
    setLoading(true)
    try {
      const data = await rpc.weightLog.list({})
      setLogs(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [])

  const handleCreate = async (data: WeightLogCreate) => {
    await rpc.weightLog.create(data)
    setShowForm(false)
    loadLogs()
  }

  const handleDelete = async (id: string) => {
    if (confirm("Delete this entry?")) {
      await rpc.weightLog.delete(id)
      loadLogs()
    }
  }

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date)

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Weight Log</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Add Entry
        </button>
      </div>

      {showForm && (
        <div className="border rounded p-4">
          <WeightLogForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left p-2">Date</th>
            <th className="text-left p-2">Weight</th>
            <th className="text-left p-2">Notes</th>
            <th className="text-right p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b">
              <td className="p-2">{formatDate(log.datetime)}</td>
              <td className="p-2">
                {log.weight} {log.unit}
              </td>
              <td className="p-2 text-gray-600">{log.notes ?? "-"}</td>
              <td className="p-2 text-right">
                <button
                  onClick={() => setEditingId(log.id)}
                  className="text-blue-600 mr-2"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(log.id)}
                  className="text-red-600"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {logs.length === 0 && (
        <p className="text-center text-gray-500 py-8">
          No entries yet. Add your first weight log!
        </p>
      )}
    </div>
  )
}
```

---

### 5.4 Injection Log Components

Similar structure to Weight Log components, with additional fields for drug, source, dosage, and injection site. Include autocomplete for drug names and injection sites using the `getDrugs` and `getSites` RPC calls.

---

### 5.5 Main App Integration

**Update: `packages/web/src/App.tsx`**

```tsx
import { useState } from "react"
import { WeightLogList } from "./components/weight/WeightLogList"
import { InjectionLogList } from "./components/injection/InjectionLogList"

type Tab = "weight" | "injection"

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("weight")

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Health Tracker</h1>
      
      <div className="flex gap-2 mb-4 border-b">
        <button
          onClick={() => setActiveTab("weight")}
          className={`px-4 py-2 ${
            activeTab === "weight" 
              ? "border-b-2 border-blue-600 text-blue-600" 
              : "text-gray-600"
          }`}
        >
          Weight
        </button>
        <button
          onClick={() => setActiveTab("injection")}
          className={`px-4 py-2 ${
            activeTab === "injection" 
              ? "border-b-2 border-blue-600 text-blue-600" 
              : "text-gray-600"
          }`}
        >
          Injections
        </button>
      </div>

      {activeTab === "weight" && <WeightLogList />}
      {activeTab === "injection" && <InjectionLogList />}
    </div>
  )
}
```

---

## Quick Start Guide (for Beginners)

### Step 1: Set Up PostgreSQL

```bash
# Enter nix shell (after updating flake.nix)
direnv reload

# Start postgres
pg_ctl start -l .postgres/log

# Create database (first time only)
createdb scalability_dev
```

### Step 2: Run Migrations

```bash
bun run --filter @scale/api migrate
```

### Step 3: Start Development Servers

```bash
# Terminal 1: API
bun run --filter @scale/api dev

# Terminal 2: Web
bun run --filter @scale/web dev
```

### Step 4: Verify

1. Open http://localhost:5173
2. Add a weight log entry
3. Verify it appears in the list

---

## Unresolved Questions

1. **Docker vs native postgres?** - Recommend Nix for tighter devShell integration
2. **Dosage modeling** - String for now, structured (amount + unit) later
3. **Soft deletes?** - Skip for MVP, add `deleted_at` column later
4. **Audit trail?** - Skip for MVP, consider event sourcing later
5. **UI styling?** - Tailwind inline for MVP, extract components later
6. **Error handling in UI?** - Basic try/catch for MVP, add toast notifications later

---

## Task Checklist

### Phase 1: PostgreSQL Infrastructure
- [ ] 1.1.1 Update flake.nix with postgres
- [ ] 1.1.2 Add .postgres to .gitignore
- [ ] 1.1.3 Create database scalability_dev
- [ ] 1.2.1 Create packages/api/src/Sql.ts
- [ ] 1.2.2 Create packages/api/.env.example
- [ ] 1.2.3 Add .env to .gitignore
- [ ] 1.2.4 Write Sql.test.ts to verify connection
- [ ] 1.3.1 Create migrations folder
- [ ] 1.3.2 Create migrate.ts script
- [ ] 1.3.3 Add migrate script to package.json
- [ ] 1.3.4 Create 000_create_migrations_table.sql

### Phase 2: Domain Modeling
- [ ] 2.1.1 Create packages/shared/src/domain folder
- [ ] 2.2.1 Create WeightLog.ts with all schemas
- [ ] 2.3.1 Create InjectionLog.ts with all schemas
- [ ] 2.4.1 Create domain/index.ts
- [ ] 2.4.2 Update shared/index.ts exports
- [ ] 2.5.1 Create 001_create_weight_logs.sql
- [ ] 2.5.2 Create 002_create_injection_logs.sql
- [ ] 2.5.3 Run migrations

### Phase 3: Effect Service Layer
- [ ] 3.1.1 Create repositories folder
- [ ] 3.2.1 Create WeightLogRepo.ts
- [ ] 3.3.1 Create InjectionLogRepo.ts
- [ ] 3.4.1 Create repositories/index.ts

### Phase 4: RPC Layer
- [ ] 4.1.1 Update shared/Rpc.ts with WeightLogRpcs
- [ ] 4.1.2 Update shared/Rpc.ts with InjectionLogRpcs
- [ ] 4.1.3 Update AppRpcs to merge new groups
- [ ] 4.2.1 Update RpcHandlers.ts with weight handlers
- [ ] 4.2.2 Update RpcHandlers.ts with injection handlers
- [ ] 4.3.1 Update main.ts with repository and SQL layers

### Phase 5: UI Layer
- [ ] 5.1.1 Create components folder structure
- [ ] 5.2.1 Update rpc.ts with typed client
- [ ] 5.3.1 Create WeightLogForm.tsx
- [ ] 5.3.2 Create WeightLogList.tsx
- [ ] 5.4.1 Create InjectionLogForm.tsx
- [ ] 5.4.2 Create InjectionLogList.tsx
- [ ] 5.5.1 Update App.tsx with tabs and pages
- [ ] 5.5.2 End-to-end testing
