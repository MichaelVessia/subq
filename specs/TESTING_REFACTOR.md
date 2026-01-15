# Test Suite Refactor to EFFECT_TESTING.md Compliance

## Overview

Refactor the existing test suite in `packages/api/tests/` to fully align with the patterns documented in `specs/EFFECT_TESTING.md`.

## Success Criteria

- [ ] All tests use `it.layer(TestLayer)("name", ...)` pattern instead of `.pipe(Effect.provide(TestLayer))`
- [ ] `setupTables` and `clearTables` boilerplate removed from individual tests, handled in layer setup
- [ ] Property-based tests added for branded type validation and core business logic
- [ ] TestClock pattern (fork + adjust) used where time-dependent logic exists
- [ ] `Layer.fresh` used where test isolation requires independent layer instances
- [ ] All existing tests continue to pass

## Out of Scope

- E2E tests (separate spec exists)
- CLI tests (different testing concerns)
- Adding new test coverage beyond what exists

## Phase 1: Layer Pattern Migration

### 1.1 Create Self-Initializing Test Layer

Current pattern (repeated in every test):
```typescript
const TestLayer = makeTestLayer(WeightLogRepoLive)

it.effect('test name', () =>
  Effect.gen(function* () {
    yield* setupTables
    yield* clearTables
    // ... test logic
  }).pipe(Effect.provide(TestLayer)),
)
```

Target pattern:
```typescript
const TestLayer = makeInitializedTestLayer(WeightLogRepoLive)

it.layer(TestLayer)('test name', () =>
  Effect.gen(function* () {
    // ... test logic only
  })
)
```

### 1.2 Update test-db.ts Helper

Add a new helper that composes setup/teardown into the layer:

```typescript
export const makeInitializedTestLayer = <Out, Err>(
  repoLayer: Layer.Layer<Out, Err, SqlClient.SqlClient>
) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      yield* setupTables
      yield* clearTables
    })
  ).pipe(
    Layer.provideMerge(repoLayer),
    Layer.provideMerge(SqliteTestLayer),
    Layer.fresh // Each test gets fresh DB state
  )
```

### 1.3 Migrate All Test Files

Files to update:
- `inventory-repo.test.ts`
- `data-export-service.test.ts`
- `injection-log-repo.test.ts`
- `stats-service.test.ts`
- `weight-log-repo.test.ts`
- `schedule-repo.test.ts`
- `goal-repo.test.ts`

The `schedule-rpc-handlers.test.ts` file uses mock layers and `resetTestState()` pattern which is appropriate for unit testing pure logic.

### Phase 1 Checkpoint

- [ ] `makeInitializedTestLayer` helper created
- [ ] All repo test files migrated to `it.layer` pattern
- [ ] Zero `yield* setupTables` / `yield* clearTables` in test bodies
- [ ] All tests pass

## Phase 2: Property-Based Testing

### 2.1 Identify Candidates

Branded types that benefit from property testing:
- `Weight` (positive number constraints)
- `Limit`, `Offset` (pagination bounds)
- `Dosage`, `DrugName`, `DrugSource` (string format constraints)

Business logic candidates:
- `frequencyToDays` conversion
- Phase date range calculations
- Stats aggregation (weight stats, injection frequency)

### 2.2 Add Property-Based Tests

Create new test file `property-tests.test.ts`:

```typescript
import { it } from '@codeforbreakfast/bun-test-effect'
import { Schema } from 'effect'
import { Weight } from '@subq/shared'

describe('Branded Type Validation', () => {
  it.effect.prop(
    'Weight is always positive',
    [Schema.Number.pipe(Schema.positive())],
    ([value]) =>
      Effect.gen(function* () {
        const weight = Weight.make(value)
        expect(weight).toBeGreaterThan(0)
      })
  )
})
```

### Phase 2 Checkpoint

- [ ] `property-tests.test.ts` created
- [ ] Property tests for at least 3 branded types
- [ ] Property tests for `frequencyToDays`
- [ ] All property tests pass

## Phase 3: TestClock Pattern

### 3.1 Identify Time-Dependent Tests

Current usage of `setSystemTime` in `schedule-rpc-handlers.test.ts`:
```typescript
setSystemTime(new Date('2024-01-15T12:00:00Z'))
// ... test logic
setSystemTime()
```

### 3.2 Migrate to TestClock Pattern

For tests that use `DateTime.unsafeNow()` internally, use fork + adjust:

```typescript
it.effect('calculates next dose based on every_3_days frequency', () =>
  Effect.gen(function* () {
    // Fork the effect that internally calls DateTime.unsafeNow()
    const fiber = yield* Effect.fork(calculateNextDose)

    // Set the clock to specific time
    yield* TestClock.setTime(DateTime.unsafeMake('2024-01-15T12:00:00Z'))

    const result = yield* Fiber.join(fiber)
    // ... assertions
  })
)
```

### 3.3 Alternative: Inject Clock Dependency

For more testable code, consider making the current time an explicit dependency rather than using `DateTime.unsafeNow()`. This is a larger refactor but more aligned with Effect patterns.

### Phase 3 Checkpoint

- [ ] All `setSystemTime` calls replaced with TestClock or injected dependency
- [ ] Time-dependent tests are deterministic
- [ ] No global state mutation for time

## Phase 4: Layer Isolation

### 4.1 Audit Shared State

Check for tests that might interfere with each other due to shared layer state. The in-memory SQLite approach with `Layer.fresh` should handle most cases.

### 4.2 Add Layer.fresh Where Needed

For test suites where different tests need different layer configurations:

```typescript
const BaseTestLayer = Layer.effect(Database, ...)

// Test A needs fresh instance
it.layer(Layer.fresh(BaseTestLayer))('test A', () => ...)

// Test B needs fresh instance
it.layer(Layer.fresh(BaseTestLayer))('test B', () => ...)
```

### Phase 4 Checkpoint

- [ ] All test files audited for layer isolation
- [ ] `Layer.fresh` added where tests could interfere
- [ ] Tests run reliably in any order

## Verification Commands

```bash
# Run all API tests
cd packages/api && bun test

# Run specific test file
cd packages/api && bun test tests/weight-log-repo.test.ts

# Run with verbose output
cd packages/api && bun test --verbose
```

## Migration Notes

1. **Backward compatible**: Keep old `makeTestLayer` helper until migration complete
2. **Incremental**: Migrate one test file at a time
3. **Verify each file**: Run tests after each file migration
4. **Property tests are additive**: Don't remove existing tests, add property tests alongside
