# Reference Repositories

Git subtrees for pattern discovery and API lookup. Clone these into `repos/` for local reference.

## Setup

```bash
mkdir -p repos
git subtree add --prefix=repos/effect https://github.com/Effect-TS/effect.git main --squash
git subtree add --prefix=repos/tanstack-router https://github.com/TanStack/router.git main --squash
git subtree add --prefix=repos/effect-atom https://github.com/tim-smart/effect-atom.git main --squash
```

## Effect Library (`repos/effect/`)

Core functional TypeScript library.

### Key Modules

| Module | Purpose |
|--------|---------|
| `Effect.ts` | Core effect type and combinators |
| `Schema.ts` | Validation, encoding, decoding |
| `Context.ts` | Service tags and dependency injection |
| `Layer.ts` | Service composition and lifecycle |
| `Brand.ts` | Branded/nominal types |
| `Either.ts` | Error handling |
| `Option.ts` | Optional values |
| `Chunk.ts` | Immutable sequences with equality |
| `DateTime.ts` | Date/time operations |
| `Duration.ts` | Time durations |
| `Stream.ts` | Streaming data |
| `Fiber.ts` | Concurrent execution |

### SQL Packages

- `@effect/sql` - Core SQL abstractions
- `@effect/sql-sqlite-bun` - SQLite client for Bun (we use this)
- `@effect/sql-pg` - PostgreSQL client
- `@effect/sql-drizzle` - Drizzle integration

### Platform Packages

- `@effect/platform` - Cross-platform abstractions (HTTP, FileSystem, CLI)
- `@effect/platform-bun` - Bun runtime implementation
- `@effect/platform-node` - Node runtime implementation
- `@effect/platform-browser` - Browser runtime implementation

### Other Packages

- `@effect/vitest` - Testing utilities
- `@effect/rpc` - RPC framework
- `@effect/opentelemetry` - Observability

## TanStack Router (`repos/tanstack-router/`)

Full-stack React framework.

### Key Packages

- `@tanstack/react-router` - React router with type-safe navigation
- `@tanstack/start` - Full-stack framework (SSR, server functions)
- `@tanstack/router-core` - Core router logic

### Server Functions

RPC-style communication:

```typescript
import { createServerFn } from "@tanstack/start"

const getUser = createServerFn("GET", async (id: string) => {
  return db.users.find(id)
})
```

### Examples Directory

`packages/start-examples/` contains real-world usage patterns.

## Effect Atom (`repos/effect-atom/`)

Reactive state management for Effect.

### Packages

- `@effect-atom/core` - Core atom primitives
- `@effect-atom/atom-react` - React bindings (we use this)
- `@effect-atom/atom-vue` - Vue bindings

## Search Patterns

### Find Service Definitions

```bash
grep -r "Context.Tag" repos/effect/packages/effect/src/
```

### Find Schema Patterns

```bash
grep -r "Schema.Class" repos/effect/packages/effect/src/Schema.ts
grep -r "Schema.TaggedError" repos/effect/packages/effect/src/
```

### Find Layer Patterns

```bash
grep -r "Layer.effect" repos/effect/packages/effect/src/Layer.ts
grep -r "Layer.scoped" repos/effect/packages/effect/src/
```

### Find SQL Patterns

```bash
grep -r "SqlSchema" repos/effect/packages/sql/src/
grep -r "sql.insert" repos/effect/packages/sql/src/
grep -r "withTransaction" repos/effect/packages/sql/src/
```

### Find Effect.gen Usage

```bash
grep -r "Effect.gen" repos/effect/packages/ --include="*.ts" | head -50
```

### Find Test Patterns

```bash
find repos/effect/packages -name "*.test.ts" | head -20
grep -r "it.effect" repos/effect/packages/
```

### Find Atom Patterns

```bash
grep -r "runtime.atom" repos/effect-atom/packages/
grep -r "Atom.family" repos/effect-atom/packages/
grep -r "useAtom" repos/effect-atom/packages/atom-react/
```

## Package Versions

Check current versions:

```bash
cat repos/effect/packages/effect/package.json | grep version
cat repos/tanstack-router/packages/react-router/package.json | grep version
cat repos/effect-atom/packages/atom-react/package.json | grep version
```

## Updating Subtrees

```bash
git subtree pull --prefix=repos/effect https://github.com/Effect-TS/effect.git main --squash
git subtree pull --prefix=repos/tanstack-router https://github.com/TanStack/router.git main --squash
git subtree pull --prefix=repos/effect-atom https://github.com/tim-smart/effect-atom.git main --squash
```
