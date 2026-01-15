# Effect SQL Best Practices

## Core Principle

Use Schema to get both type safety AND runtime validation. Never use TypeScript interfaces alone for SQL row types.

## Schema-Based Decoding

### Correct Approach

Use `Schema.Struct` combined with `SqlSchema` methods:

```typescript
const WeightEntryRow = Schema.Struct({
  id: Schema.String,
  user_id: Schema.String,
  weight: Schema.Number,
  recorded_at: Schema.String,
  notes: Schema.NullOr(Schema.String)
})

// For single result (returns Option)
const findById = (id: string) =>
  SqlSchema.findOne({
    Request: Schema.String,
    Result: WeightEntryRow,
    execute: (id) => sql`SELECT * FROM weight_entries WHERE id = ${id}`
  })(id)

// For multiple results
const findByUser = (userId: string) =>
  SqlSchema.findAll({
    Request: Schema.String,
    Result: WeightEntryRow,
    execute: (userId) => sql`SELECT * FROM weight_entries WHERE user_id = ${userId}`
  })(userId)

// For insert/update (returns void)
const insert = (entry: typeof WeightEntryRow.Type) =>
  SqlSchema.void({
    Request: WeightEntryRow,
    execute: (e) => sql`INSERT INTO weight_entries ${sql.insert(e)}`
  })(entry)
```

## Entity Modeling

For comprehensive CRUD, use `Model.Class`:

```typescript
class WeightEntry extends Model.Class<WeightEntry>("WeightEntry")({
  id: Model.Generated(Schema.String.pipe(Schema.brand("WeightEntryId"))),
  userId: Schema.String.pipe(Schema.brand("UserId")),
  weight: Schema.Number,
  recordedAt: Schema.DateTimeUtc,
  notes: Schema.Option(Schema.String),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate
}) {}

// Automatically generates:
// - WeightEntry.select - for SELECT results
// - WeightEntry.insert - for INSERT data
// - WeightEntry.update - for UPDATE data
// - WeightEntry.json - for JSON serialization
```

## SQL Helpers

### Insert

```typescript
// Single row
sql`INSERT INTO weight_entries ${sql.insert(entry)}`

// Batch insert
sql`INSERT INTO weight_entries ${sql.insert(entries)}`
```

### Update

```typescript
sql`UPDATE weight_entries SET ${sql.update(entry, ["weight", "notes"])} WHERE id = ${id}`
```

### IN Clause

```typescript
sql`SELECT * FROM weight_entries WHERE id IN ${sql.in(ids)}`
```

### Combining Conditions

```typescript
sql`SELECT * FROM weight_entries WHERE ${sql.and([
  sql`user_id = ${userId}`,
  sql`recorded_at >= ${startDate}`
])}`
```

## Transformation Logic

Domain object mapping should use pure functions, not Effect wrapping:

```typescript
// GOOD - pure transformation
const toDomain = (row: typeof WeightEntryRow.Type): WeightEntry =>
  new WeightEntry({
    id: row.id as WeightEntryId,
    userId: row.user_id as UserId,
    weight: row.weight,
    recordedAt: DateTime.unsafeFromString(row.recorded_at),
    notes: Option.fromNullable(row.notes)
  })

// BAD - unnecessary Effect wrapping
const toDomain = (row: typeof WeightEntryRow.Type) =>
  Effect.succeed(new WeightEntry({ ... }))
```

## Error Handling

Use `Effect.mapError()` for expected errors, not `catchAllCause()`:

```typescript
// GOOD
const findById = (id: string) =>
  SqlSchema.findOne({ ... })(id).pipe(
    Effect.mapError((e) => new NotFoundError({ id }))
  )

// BAD - catches defects too
const findById = (id: string) =>
  SqlSchema.findOne({ ... })(id).pipe(
    Effect.catchAllCause((cause) => ...)
  )
```

## Transactions

Use `sql.withTransaction()` for atomic operations:

```typescript
const createEntryWithAudit = (entry: WeightEntry, audit: AuditLog) =>
  sql.withTransaction(
    Effect.gen(function* () {
      yield* insertEntry(entry)
      yield* insertAuditLog(audit)
    })
  )
```

## SQLite-Specific Notes

For `@effect/sql-sqlite-bun`:

```typescript
import { SqliteBunClient } from "@effect/sql-sqlite-bun"

const SqliteLive = SqliteBunClient.layer({
  filename: "data.db"
})
```

Connection pooling is handled automatically. Run migrations at application startup.
