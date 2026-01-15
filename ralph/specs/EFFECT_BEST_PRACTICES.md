# Effect Best Practices

## Critical Rules

### 1. No `any` Types or Type Casts

Use proper types, `Schema.make()`, `Schema.decodeUnknown()`, or `identity<T>()` instead. Never use `as Type` assertions or the `any` type.

### 2. Never Use `catchAll` on `never` Error Types

If error type is `never`, the effect cannot fail, making catchAll dead code:

```typescript
// BAD - effect cannot fail, catchAll is dead code
Effect.succeed(42).pipe(Effect.catchAll(() => Effect.succeed(0)))

// GOOD - only use catchAll when errors are possible
myFallibleEffect.pipe(Effect.catchAll((e) => handleError(e)))
```

### 3. No Global `Error` in Effect Channels

Always use `Schema.TaggedError` with unique `_tag` values for domain-specific errors:

```typescript
// BAD
class MyError extends Error {}

// GOOD
class NotFoundError extends Schema.TaggedError<NotFoundError>("NotFoundError")({
  entityType: Schema.String,
  id: Schema.String
}) {}
```

### 4. `disableValidation` is Completely Banned

Always validate data through Schema. Fix the data or schema instead of disabling validation.

### 5. Don't Wrap Safe Operations in Effect

Use Effect only when operations might fail, need dependencies, or require async composition:

```typescript
// BAD - unnecessary wrapping
const double = (n: number) => Effect.succeed(n * 2)

// GOOD - pure function for safe operations
const double = (n: number) => n * 2
```

### 6. Never Use `catchAllCause` to Wrap Errors

It catches defects (bugs) alongside errors. Use `catchAll` or `mapError` instead:

```typescript
// BAD - catches both errors and defects
effect.pipe(Effect.catchAllCause((cause) => ...))

// GOOD - only handles expected failures
effect.pipe(Effect.catchAll((error) => ...))
effect.pipe(Effect.mapError((error) => ...))
```

## Schema Patterns

### Always Use Schema for Data Classes

`Schema.Class` and `Schema.TaggedClass` automatically provide Equal/Hash:

```typescript
class WeightEntry extends Schema.Class<WeightEntry>("WeightEntry")({
  id: Schema.String.pipe(Schema.brand("WeightEntryId")),
  weight: Schema.Number,
  date: Schema.DateTimeUtc,
  userId: Schema.String.pipe(Schema.brand("UserId"))
}) {}
```

### Define Recursive Schemas with Schema.suspend()

```typescript
interface CategoryEncoded {
  readonly id: string
  readonly name: string
  readonly children: ReadonlyArray<CategoryEncoded>
}

const Category: Schema.Schema<Category, CategoryEncoded> = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  children: Schema.Array(Schema.suspend(() => Category))
})
```

### Use Schema.brand for Type-Safe IDs

```typescript
const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

const WeightEntryId = Schema.String.pipe(Schema.brand("WeightEntryId"))
type WeightEntryId = typeof WeightEntryId.Type
```

### Never Use *FromSelf Schemas

They're not JSON serializable. Use the standard variants.

### Use Schema.TaggedError for All Domain Errors

```typescript
class ValidationError extends Schema.TaggedError<ValidationError>("ValidationError")({
  field: Schema.String,
  message: Schema.String
}) {}

class NotFoundError extends Schema.TaggedError<NotFoundError>("NotFoundError")({
  entityType: Schema.String,
  id: Schema.String
}) {}
```

### Use Chunk Instead of Array in Domain Models

Chunk provides proper structural equality:

```typescript
class EntryList extends Schema.Class<EntryList>("EntryList")({
  entries: Schema.Chunk(WeightEntry)
}) {}
```

### Always Use Effect Variants for Decoding/Encoding

Never use the Sync versions that throw:

```typescript
// BAD - throws on failure
Schema.decodeUnknownSync(MySchema)(data)

// GOOD - returns Effect
Schema.decodeUnknown(MySchema)(data)
```

## Value-Based Equality

Effect provides value-based equality through Equal and Hash. Schema.Class instances automatically implement these:

```typescript
const entry1 = new WeightEntry({ id: "1", weight: 150, ... })
const entry2 = new WeightEntry({ id: "1", weight: 150, ... })

Equal.equals(entry1, entry2) // true - compares by field values
```

## Error Handling

Use `Effect.catchTag` for precise error handling with discriminated unions:

```typescript
effect.pipe(
  Effect.catchTag("NotFoundError", (e) =>
    Effect.succeed(defaultValue)
  ),
  Effect.catchTag("ValidationError", (e) =>
    Effect.fail(new UserFacingError({ message: e.message }))
  )
)
```

## Service Layers

Create layers with `Layer.effect` (simple services) or `Layer.scoped` (resources needing cleanup):

```typescript
// Simple service
const MyServiceLive = Layer.effect(
  MyService,
  Effect.gen(function* () {
    const dep = yield* Dependency
    return { ... }
  })
)

// Service with cleanup
const DatabaseLive = Layer.scoped(
  Database,
  Effect.acquireRelease(
    connect(),
    (conn) => disconnect(conn)
  )
)
```
