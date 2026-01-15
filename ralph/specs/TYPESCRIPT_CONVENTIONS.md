# TypeScript Conventions

## TypeScript Project References

Each package in the monorepo requires config files for proper incremental builds:

```
packages/api/
  tsconfig.json      # Root config with references
  tsconfig.src.json  # Source compilation (composite: true)
  tsconfig.test.json # Test compilation
```

### Root Config

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.src.json" },
    { "path": "./tsconfig.test.json" }
  ]
}
```

### Source Config

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"]
}
```

The `composite: true` setting is critical for enabling incremental builds and dependency tracking.

## Module Resolution

Use `moduleResolution: "bundler"` with `rewriteRelativeImportExtensions`:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "rewriteRelativeImportExtensions": true
  }
}
```

This allows writing `.ts` imports that compile to valid `.js` paths.

## Import Conventions

### Relative Imports: Include .ts Extension

```typescript
// GOOD
import { WeightService } from "./services/weight.ts"
import { NotFoundError } from "../errors/not-found.ts"

// BAD
import { WeightService } from "./services/weight"
import { NotFoundError } from "../errors/not-found.js"
```

### Package Imports: Never Include Extension

```typescript
// GOOD
import { Effect, Schema } from "effect"
import { HttpApi } from "@effect/platform"
import { WeightEntry } from "@subq/shared"

// BAD
import { Effect } from "effect/index.js"
import { WeightEntry } from "@subq/shared/src/domain.ts"
```

### Never Include /src/ in Package Paths

```typescript
// GOOD
import { WeightEntry } from "@subq/shared"

// BAD - exposes implementation detail
import { WeightEntry } from "@subq/shared/src/domain"
```

Package exports in `package.json` handle path mapping:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./domain": "./src/domain.ts"
  }
}
```

## Anti-Pattern: Barrel Files

**Never create index.ts files for re-exporting modules.**

Barrel files cause:
- Circular dependencies
- Slower builds (imports entire barrel)
- Reduced traceability
- Increased bundle sizes

### Bad

```
src/
  services/
    index.ts        # Re-exports all services
    weight.ts
    user.ts
```

```typescript
// services/index.ts
export * from "./weight.ts"
export * from "./user.ts"

// consumer
import { WeightService, UserService } from "./services"
```

### Good

```typescript
// Direct imports
import { WeightService } from "./services/weight.ts"
import { UserService } from "./services/user.ts"
```

## Module Structure

Use flat, focused modules:

```
src/
  services/
    weight.ts       # WeightService + helpers
    user.ts         # UserService + helpers
  domain/
    weight.ts       # WeightEntry schema + types
    user.ts         # User schema + types
  errors/
    not-found.ts    # NotFoundError
    validation.ts   # ValidationError
```

Each module should be self-contained. Related functionality belongs in the same file when practical.

## Type Safety Rules

### No `any`

```typescript
// BAD
const data: any = await fetch(url)

// GOOD
const data = await Schema.decodeUnknown(MySchema)(await response.json())
```

### No Type Assertions (`as`)

```typescript
// BAD
const entry = data as WeightEntry

// GOOD
const entry = Schema.decodeUnknownSync(WeightEntry)(data)
```

### No Non-Null Assertions (`!`)

```typescript
// BAD
const value = map.get(key)!

// GOOD
const value = map.get(key)
if (value === undefined) {
  throw new Error("Key not found")
}

// BETTER with Effect
const value = Option.fromNullable(map.get(key)).pipe(
  Option.getOrThrow
)
```

## Strict Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": true
  }
}
```
