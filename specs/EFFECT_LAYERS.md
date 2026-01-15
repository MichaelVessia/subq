# Effect Layers: Deep Dive

## Core Concepts

### Identity-Based Memoization

Layers are lazy by default and memoized by object identity (reference equality), not by type or value. The system maintains a `MemoMap` keyed by layer object references.

```typescript
// Same layer object - memoized, evaluates once
const dbLayer = makeDatabaseLayer()
const app = Layer.mergeAll(dbLayer, dbLayer) // Single DB connection

// Different layer objects - NOT memoized, separate instances
const app = Layer.mergeAll(makeDatabaseLayer(), makeDatabaseLayer()) // Two connections!
```

### Layer.fresh

Wraps a layer to escape memoization entirely:

```typescript
// Forces new instance even with same layer reference
const freshDb = Layer.fresh(dbLayer)
```

Use `Layer.fresh` only when:
- You have the same layer reference appearing multiple times
- You genuinely need separate instances

### Factory Functions Don't Require Fresh

Factory functions that return new layer objects don't need `Layer.fresh`:

```typescript
// Each call returns a NEW layer object - no memoization between them
const makeTestDb = () => Layer.effect(Database, ...)

// These are already separate instances
const layer1 = makeTestDb()
const layer2 = makeTestDb()
```

### Layer.memoize

Creates a layer that is lazily built and explicitly memoized within a scope:

```typescript
const memoizedLayer = Layer.memoize(expensiveLayer)
```

Useful when you need delayed construction with guaranteed single-build semantics.

### ManagedRuntime

Persists a MemoMap across multiple effect runs, enabling layer sharing:

```typescript
const runtime = ManagedRuntime.make(appLayer)

// Both runs share the same layer instances
await runtime.runPromise(effect1)
await runtime.runPromise(effect2)
```

Multiple runtimes can share the same MemoMap:

```typescript
const memoMap = Layer.unsafeMakeMemoMap()
const runtime1 = ManagedRuntime.make(layer1, { memoMap })
const runtime2 = ManagedRuntime.make(layer2, { memoMap })
```

## Testing Patterns

### Isolated Test Groups

Each `it.layer()` block creates a new MemoMap, automatically isolating layers between different test groups:

```typescript
describe("WeightService", () => {
  it.layer(TestLayers)("test 1", () =>
    Effect.gen(function* () {
      // Fresh layer instances for this group
    })
  )

  it.layer(TestLayers)("test 2", () =>
    Effect.gen(function* () {
      // Fresh layer instances for this group too
    })
  )
})
```

### Shared Infrastructure

For expensive resources like databases, use vitest's `globalSetup`:

```typescript
// vitest.global-setup.ts
export async function setup() {
  const container = await startDatabase()
  process.env.DATABASE_URL = container.getConnectionString()
}

export async function teardown() {
  await container.stop()
}
```

Tests then use the shared database connection.

## Summary Table

| Scenario | Memoization Behavior |
|----------|---------------------|
| Same layer reference, same build | Memoized (single instance) |
| Same layer reference, different builds | Not memoized |
| Different layer references | Not memoized |
| `Layer.fresh(layer)` | Never memoized |
| Factory function calls | Each call = new reference |

## Practical Rules

1. **Avoid `Layer.fresh` with factories** - Factory functions already return new objects
2. **Use `Layer.fresh` only for same-reference duplication** - When you truly need separate instances from one reference
3. **Use `globalSetup` for shared infrastructure** - Databases, containers, expensive resources
4. **Rely on `it.layer()` for test isolation** - Automatic MemoMap per test group
5. **Remember memoization operates per-build** - MemoMap is not global across all Effect runs
