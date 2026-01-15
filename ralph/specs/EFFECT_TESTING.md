# Effect Testing

## Core Testing Methods

Four primary test variants from `@effect/vitest` (or `@codeforbreakfast/bun-test-effect` for Bun):

| Variant | Clock | Scope | Use Case |
|---------|-------|-------|----------|
| `it.effect` | TestClock | No | Standard deterministic tests |
| `it.live` | Real clock | No | Tests requiring actual time/IO |
| `it.scoped` | TestClock | Yes | Resource management tests |
| `it.scopedLive` | Real clock | Yes | Real resources with actual time |

## TestClock Testing Pattern

Fork effects before advancing the clock:

```typescript
import { it } from "@codeforbreakfast/bun-test-effect"
import { Duration, Effect, Fiber, TestClock } from "effect"

it.effect("schedules reminder after delay", () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.fork(
      Effect.sleep(Duration.minutes(5)).pipe(
        Effect.map(() => "reminder sent")
      )
    )

    yield* TestClock.adjust(Duration.minutes(5))

    const result = yield* Fiber.join(fiber)
    expect(result).toBe("reminder sent")
  })
)
```

## Layer Composition and Sharing

### Using it.layer

```typescript
import { it } from "@codeforbreakfast/bun-test-effect"
import { Layer } from "effect"

const TestLayer = Layer.mergeAll(
  WeightServiceTest,
  UserServiceTest
)

describe("WeightService", () => {
  it.layer(TestLayer)("creates entry", () =>
    Effect.gen(function* () {
      const service = yield* WeightService
      const entry = yield* service.create({ weight: 150 })
      expect(entry.weight).toBe(150)
    })
  )
})
```

### Module-Level Constant Layers

When tests need different configurations for the same module-level layer, use `Layer.fresh`:

```typescript
const BaseTestLayer = Layer.effect(Database, ...)

// Test A needs fresh instance
it.layer(Layer.fresh(BaseTestLayer))("test A", () => ...)

// Test B needs fresh instance
it.layer(Layer.fresh(BaseTestLayer))("test B", () => ...)
```

Factory functions creating new layer compositions don't need `Layer.fresh`.

## Database Testing

### In-Memory SQLite for Fast Tests

```typescript
import { SqliteBunClient } from "@effect/sql-sqlite-bun"

const TestDbLayer = SqliteBunClient.layer({
  filename: ":memory:"
}).pipe(
  Layer.provide(MigrationsLayer)
)
```

### Shared Database via Global Setup

For integration tests needing persistent state:

```typescript
// vitest.global-setup.ts (or bun equivalent)
export async function setup() {
  // Start database container or create test database
  process.env.TEST_DATABASE_URL = "..."
}

export async function teardown() {
  // Clean up
}
```

## Property-Based Testing

Using FastCheck with Effect:

```typescript
import { Schema } from "effect"

it.effect.prop(
  "weight is always positive",
  [Schema.Number.pipe(Schema.positive())],
  ([weight]) =>
    Effect.gen(function* () {
      const service = yield* WeightService
      const entry = yield* service.create({ weight })
      expect(entry.weight).toBeGreaterThan(0)
    })
)
```

## Test Organization

```typescript
describe("WeightService", () => {
  describe("create", () => {
    it.effect("creates entry with valid data", () => ...)
    it.effect("fails with negative weight", () => ...)
  })

  describe("findByUser", () => {
    it.layer(SeededDataLayer)("returns user entries", () => ...)
    it.layer(EmptyDataLayer)("returns empty for new user", () => ...)
  })
})
```

## Key Implementation Details

- Use `Effect.acquireRelease` for proper cleanup in scoped tests
- Migrations should be idempotent when using shared databases
- Test data must be unique across tests in shared database scenarios
- For Bun, use `@codeforbreakfast/bun-test-effect` instead of `@effect/vitest`

## Testing Error Paths

```typescript
it.effect("handles not found error", () =>
  Effect.gen(function* () {
    const service = yield* WeightService
    const result = yield* service.findById("nonexistent").pipe(
      Effect.either
    )

    expect(Either.isLeft(result)).toBe(true)
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("NotFoundError")
    }
  })
)
```

## Mocking Services

```typescript
const MockWeightService = Layer.succeed(
  WeightService,
  {
    create: () => Effect.succeed(mockEntry),
    findById: () => Effect.succeed(Option.some(mockEntry)),
    findByUser: () => Effect.succeed([mockEntry])
  }
)

it.layer(MockWeightService)("uses mock service", () => ...)
```
