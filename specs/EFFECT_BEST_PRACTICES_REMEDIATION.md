# Effect Best Practices Remediation Spec

## Overview

Audit findings from `specs/EFFECT_BEST_PRACTICES.md` compliance check. This spec tracks violations and remediation work.

## Success Criteria

- [ ] Zero `as any` type casts in project code
- [ ] Zero `Effect.fail(new Error(...))` patterns
- [ ] Zero `Schema.*Sync` methods
- [ ] Zero `*FromSelf` schemas
- [ ] CLI validation errors use `Schema.TaggedError`
- [ ] Auth API response schemas defined in shared package

## Out of Scope

- `repos/effect` and `repos/effect-atom` (vendored dependencies)
- `DateTime.unsafe*` methods (acceptable with validated input)
- `catchAll` review (keeping defensive error handling)

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CLI error location | `packages/cli/src/errors.ts` | CLI-specific errors, not needed by web |
| Schema.Sync handling | Convert to Effect | Use Effect-based variants with UI state handling |
| Branded type fix | Schema decode at boundary | Validate and brand CLI inputs via Schema.decodeUnknown |
| Auth response schemas | `packages/shared` | Server API contract consumed by CLI |
| catchAll audit | Keep defensive | Leave catchAll even if error channel is `never` |
| DateFromSelf | Change to Schema.Date | Prefer consistency throughout codebase |
| throw new Error | Use Effect.die | Unrecoverable defects should use die |
| PR strategy | One per phase | 4 smaller PRs for reviewability |
| CI checks | None | Rely on code review |

---

## Phase 1: Critical Type Safety Violations

**PR Title:** `fix(types): remove any casts and sync schema methods`

### 1.1 Remove `as any` Type Casts

Create branded type validators in CLI to properly decode CLI inputs:

```typescript
// packages/cli/src/lib/validators.ts
import { Schema } from 'effect'
import { Weight, Notes } from '@subq/shared'

export const validateWeight = Schema.decodeUnknown(Weight)
export const validateNotes = Schema.decodeUnknown(Notes)
```

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `packages/cli/src/commands/weight/add.ts` | 99 | `weight as Weight` | Use `validateWeight(weight)` |
| `packages/cli/src/commands/weight/add.ts` | 101 | `notes as any` | Use `validateNotes(notes)` |
| `packages/cli/src/commands/weight/update.ts` | 46 | `notes.value as any` | Use `validateNotes(notes.value)` |
| `packages/cli/src/commands/auth/login.ts` | 83,143 | `body/data as any` | Decode with auth response schema |
| `packages/web/src/components/goals/goal-progress.tsx` | 169 | `goalId as any` | Use proper GoalId type |
| `packages/api/scripts/seed.ts` | 162 | Layer casting | Fix layer types |

### 1.2 Replace `Schema.*Sync` Methods

Convert to Effect-based schema methods in data-management.tsx:

```typescript
// Before
const encoded = Schema.encodeSync(DataExport)(result)

// After
const encodeEffect = Schema.encode(DataExport)(result)
const encoded = await Effect.runPromise(encodeEffect)
```

| File | Line | Issue |
|------|------|-------|
| `packages/web/src/components/settings/data-management.tsx` | 32 | `Schema.encodeSync` |
| `packages/web/src/components/settings/data-management.tsx` | 63 | `Schema.decodeUnknownSync` |

Error handling: Show user-friendly toast on schema failures.

### 1.3 Replace `*FromSelf` Schemas

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `packages/api/src/stats/stats-service.ts` | 35 | `Schema.DateFromSelf` | Use `Schema.Date` |

```typescript
// Before
const DateFromString = Schema.transform(Schema.String, Schema.DateFromSelf, {
  decode: (s) => new Date(s),
  encode: (d) => d.toISOString(),
})

// After
const DateFromString = Schema.transform(Schema.String, Schema.Date, {
  decode: (s) => new Date(s),
  encode: (d) => d.toISOString(),
})
```

### Phase 1 Checkpoint

- [ ] `rg "as any" packages/ --type ts` returns 0 results
- [ ] `rg "decodeUnknownSync|encodeSync|decodeSync" packages/ --type ts` returns 0 results
- [ ] `rg "FromSelf" packages/ --type ts` returns 0 results (except vendored repos)
- [ ] All package tests pass

---

## Phase 2: Error Handling Violations

**PR Title:** `fix(errors): replace Error with TaggedError`

### 2.1 Create CLI Error Types

Create `packages/cli/src/errors.ts`:

```typescript
import { Schema } from 'effect'

export class MissingArgumentError extends Schema.TaggedError<MissingArgumentError>()(
  'MissingArgumentError',
  {
    argument: Schema.String,
    hint: Schema.optional(Schema.String),
  }
) {}

export class InvalidSessionError extends Schema.TaggedError<InvalidSessionError>()(
  'InvalidSessionError',
  {
    message: Schema.String,
  }
) {}
```

### 2.2 Create Auth Response Schemas

Create `packages/shared/src/auth/responses.ts`:

```typescript
import { Schema } from 'effect'

export const AuthErrorResponse = Schema.Struct({
  message: Schema.optional(Schema.String),
  code: Schema.optional(Schema.String),
})

export const AuthSuccessResponse = Schema.Struct({
  user: Schema.Struct({
    id: Schema.String,
    email: Schema.String,
    name: Schema.optional(Schema.String),
  }),
  session: Schema.optional(Schema.Struct({
    token: Schema.String,
  })),
})
```

### 2.3 Replace `Effect.fail(new Error(...))` Patterns

| File | Lines | Count | Fix |
|------|-------|-------|-----|
| `packages/cli/src/commands/inventory/add.ts` | 127,137,147,157 | 4 | `MissingArgumentError` |
| `packages/cli/src/commands/injection/add.ts` | 121,131 | 2 | `MissingArgumentError` |
| `packages/cli/src/commands/weight/add.ts` | 76 | 1 | `MissingArgumentError` |
| `packages/cli/src/services/session.ts` | 51 | 1 | `InvalidSessionError` |

### 2.4 Replace `throw new Error` with `Effect.die`

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `packages/api/src/reminders/email-service.ts` | 105 | `throw new Error(...)` | `Effect.die(...)` |
| `packages/web/src/main.tsx` | 9 | `throw new Error(...)` | Keep as-is (not in Effect context) |

Note: `main.tsx` is not in an Effect context, so plain throw is acceptable for DOM root check.

### Phase 2 Checkpoint

- [ ] `rg "Effect\.fail\(new Error" packages/ --type ts` returns 0 results
- [ ] `packages/cli/src/errors.ts` exists with proper TaggedErrors
- [ ] `packages/shared/src/auth/responses.ts` exists
- [ ] All package tests pass

---

## Phase 3: Code Quality

**PR Title:** `refactor: improve Effect patterns`

### 3.1 Add Missing Exports

Ensure new error types and schemas are properly exported:

- `packages/cli/src/errors.ts` -> export from index
- `packages/shared/src/auth/responses.ts` -> export from index

### 3.2 Update Error Handling in Commands

Update CLI commands to handle new error types:

```typescript
// Example: weight/add.ts
import { MissingArgumentError } from '../../errors.js'

// Before
return yield* Effect.fail(new Error('--weight is required...'))

// After
return yield* Effect.fail(
  new MissingArgumentError({
    argument: 'weight',
    hint: 'use -i for interactive mode',
  })
)
```

### Phase 3 Checkpoint

- [ ] Error types properly exported
- [ ] CLI commands use TaggedErrors
- [ ] All tests pass

---

## Phase 4: Verification

**PR Title:** `test: add Effect best practices verification`

### 4.1 Manual Verification Commands

```bash
# Check for any violations
rg "as any" packages/ --type ts
rg "Effect\.fail\(new Error" packages/ --type ts
rg "decodeUnknownSync|encodeSync|decodeSync" packages/ --type ts
rg "FromSelf" packages/ --type ts --glob '!repos/*'

# Run all tests
cd packages/api && bun test
cd packages/cli && bun test
cd packages/web && bun test
cd packages/shared && bun test
```

### 4.2 Final Verification

- [ ] All grep checks return 0 matches
- [ ] All tests pass
- [ ] TypeScript compiles without errors

---

## Summary

| Category | Count | Priority | Phase |
|----------|-------|----------|-------|
| `as any` casts | 6 | High | 1 |
| `*Sync` schema methods | 2 | High | 1 |
| `*FromSelf` schemas | 1 | Medium | 1 |
| `new Error()` in Effect | 8 | High | 2 |
| Missing auth schemas | 2 | High | 2 |

Total violations: ~19
