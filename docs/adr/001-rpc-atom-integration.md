# ADR 001: Effect RPC with Atom-based State Management

## Status

Accepted

## Context

Need client-server communication with automatic cache invalidation and React integration. Traditional approaches require manual state management, API client setup, and imperative cache clearing.

## Decision

Use `@effect/rpc` integrated with `@effect-atom/atom-react` via `AtomRpc.Tag`.

### Architecture

**Client Setup** (`packages/web/src/rpc.ts`)
- `AtomRpc.Tag` creates RPC client that returns atoms
- Query atoms: `ApiClient.query(name, params, { reactivityKeys })`
- Mutation atoms: `ApiClient.mutation(name)`
- NDJSON over HTTP serialization

**Usage Pattern**
```typescript
// Read
const data = useAtomValue(createWeightLogListAtom())

// Write
const createLog = useAtomSet(ApiClient.mutation('WeightLogCreate'))
await createLog({
  payload,
  reactivityKeys: [ReactivityKeys.weightLogs, ReactivityKeys.goals]
})
```

**Backend** (`packages/api/src/main.ts`)
- RpcServer layer composition
- Domain handlers in `**/rpc-handlers.ts`
- Repository pattern for data access

### Key Principles

1. **Atoms = single source of truth** - one atom per query
2. **Declarative invalidation** - reactivityKeys specify dependencies
3. **Automatic refetch** - mutations invalidate related queries
4. **Result types** - `Waiting | Success | Failure`
5. **Domain separation** - each domain has rpc.ts (defs), rpc-handlers.ts (impl), repo.ts (data)

### Interaction Flow

```
Component → useAtomValue(queryAtom) → cache/fetch → RPC
          → useAtomSet(mutationAtom) → POST → invalidate → refetch

AtomRpc.Tag → HTTP (NDJSON) → RpcServer → Handlers → Repos → SQLite
```

## Consequences

### Positive

- **No manual cache management** - reactivityKeys handle invalidation
- **Type-safe** - full Effect Schema validation
- **Automatic loading states** - Result.isWaiting() built-in
- **Declarative dependencies** - clear data flow
- **Optimistic updates possible** - atom infrastructure supports it
- **Effect ecosystem** - leverages Effect's error handling, logging, dependencies

### Negative

- **Learning curve** - requires Effect knowledge
- **Bundle size** - Effect + RPC + Atom libraries
- **Debugging complexity** - abstraction layers obscure network calls
- **Less tooling** - fewer devtools than Redux/React Query

### Examples

**Weight unit preference** (`packages/web/src/hooks/use-user-settings.ts`)
- Read: `useAtomValue(UserSettingsAtom)`
- Write: `updateSettings({ reactivityKeys: [ReactivityKeys.settings] })`
- Auto-updates all dependent components

**Cross-domain invalidation** (`packages/web/src/components/weight/weight-log-list.tsx`)
- Creating weight log invalidates both `ReactivityKeys.weightLogs` and `ReactivityKeys.goals`
- Goal progress auto-refetches when weight changes

## References

- Effect RPC: https://effect.website/docs/guides/effect-rpc
- Effect Atom: https://github.com/tim-smart/effect-atom
- Implementation: `packages/web/src/rpc.ts:24-152`
