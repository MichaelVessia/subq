# Effect HttpApi + TanStack Router + Effect Atom Integration

## Architecture Overview

This stack combines:
- **Effect HttpApi** - Type-safe backend API with automatic schema validation
- **TanStack Router** - File-based routing with type-safe navigation
- **Effect Atom** - Reactive state management replacing TanStack Query

## Backend: Effect HttpApi

### API Definition

```typescript
// packages/shared/src/api.ts
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"

// Domain schemas
class WeightEntry extends Schema.Class<WeightEntry>("WeightEntry")({
  id: Schema.String.pipe(Schema.brand("WeightEntryId")),
  userId: Schema.String.pipe(Schema.brand("UserId")),
  weight: Schema.Number,
  date: Schema.DateTimeUtc,
  notes: Schema.Option(Schema.String)
}) {}

class CreateWeightEntry extends Schema.Class<CreateWeightEntry>("CreateWeightEntry")({
  weight: Schema.Number,
  date: Schema.DateTimeUtc,
  notes: Schema.OptionFromNullOr(Schema.String)
}) {}

// Error schemas
class NotFoundError extends Schema.TaggedError<NotFoundError>("NotFoundError")({
  message: Schema.String
}) {}

// Endpoint definitions
const weightGroup = HttpApiGroup.make("weight")
  .add(
    HttpApiEndpoint.get("list")
      .setPath("/weight")
      .addSuccess(Schema.Array(WeightEntry))
  )
  .add(
    HttpApiEndpoint.get("get")
      .setPath("/weight/:id")
      .setUrlParams(Schema.Struct({ id: WeightEntry.fields.id }))
      .addSuccess(WeightEntry)
      .addError(NotFoundError, { status: 404 })
  )
  .add(
    HttpApiEndpoint.post("create")
      .setPath("/weight")
      .setPayload(CreateWeightEntry)
      .addSuccess(WeightEntry)
  )

export const AppApi = HttpApi.make("app").add(weightGroup)
```

### Handler Implementation

```typescript
// packages/api/src/handlers/weight.ts
import { HttpApiBuilder } from "@effect/platform"
import { Effect } from "effect"
import { AppApi } from "@subq/shared"

export const WeightHandlers = HttpApiBuilder.group(AppApi, "weight", (handlers) =>
  handlers
    .handle("list", () =>
      Effect.gen(function* () {
        const service = yield* WeightService
        return yield* service.findAll()
      })
    )
    .handle("get", ({ urlParams }) =>
      Effect.gen(function* () {
        const service = yield* WeightService
        const entry = yield* service.findById(urlParams.id)
        return yield* Option.match(entry, {
          onNone: () => Effect.fail(new NotFoundError({ message: "Entry not found" })),
          onSome: Effect.succeed
        })
      })
    )
    .handle("create", ({ payload }) =>
      Effect.gen(function* () {
        const service = yield* WeightService
        return yield* service.create(payload)
      })
    )
)
```

## Frontend: TanStack Router

### Route Definition

```typescript
// packages/web/src/routes/weight/index.tsx
import { createFileRoute } from "@tanstack/react-router"
import { useAtom } from "@effect-atom/atom-react"
import { weightListAtom } from "../../atoms/weight"

export const Route = createFileRoute("/weight/")({
  component: WeightListPage
})

function WeightListPage() {
  const entries = useAtom(weightListAtom)

  return Result.match(entries, {
    onInitial: () => <Loading />,
    onWaiting: () => <Loading />,
    onFailure: (error) => <ErrorDisplay error={error} />,
    onSuccess: (data) => <WeightList entries={data} />
  })
}
```

### Route with Parameters

```typescript
// packages/web/src/routes/weight/$id.tsx
import { createFileRoute } from "@tanstack/react-router"
import { weightEntryFamily } from "../../atoms/weight"

export const Route = createFileRoute("/weight/$id")({
  component: WeightDetailPage
})

function WeightDetailPage() {
  const { id } = Route.useParams()
  const entry = useAtom(weightEntryFamily(id))

  return Result.match(entry, {
    onInitial: () => <Loading />,
    onWaiting: () => <Loading />,
    onFailure: (error) => <NotFound />,
    onSuccess: (data) => <WeightDetail entry={data} />
  })
}
```

## Frontend: Effect Atom

### API Client Setup

```typescript
// packages/web/src/atoms/client.ts
import { HttpApiClient } from "@effect/platform"
import { AtomRuntime, AtomHttpApi } from "@effect-atom/atom-react"
import { AppApi } from "@subq/shared"

const makeClient = HttpApiClient.make(AppApi, {
  baseUrl: import.meta.env.VITE_API_URL
})

export const runtime = AtomRuntime.make(makeClient)
export const api = AtomHttpApi.make(AppApi, runtime)
```

### Query Atoms

```typescript
// packages/web/src/atoms/weight.ts
import { Atom } from "@effect-atom/atom-react"
import { api } from "./client"

// List all entries
export const weightListAtom = api.weight.list()

// Single entry by ID (family pattern for parameterized queries)
export const weightEntryFamily = Atom.family((id: string) =>
  api.weight.get({ urlParams: { id } })
)
```

### Mutation Atoms

```typescript
// packages/web/src/atoms/weight.ts

// Mutation with automatic list refresh
export const createWeightEntry = api.weight.create({
  reactivityKeys: ["weight-list"]
})

// In component
function AddWeightForm() {
  const [result, create] = useAtomFnWithResult(createWeightEntry)

  const handleSubmit = (data: CreateWeightEntry) => {
    create({ payload: data })
  }

  return (
    <form onSubmit={handleSubmit}>
      {Result.isWaiting(result) && <Spinner />}
      {Result.isFailure(result) && <Error error={result.error} />}
      ...
    </form>
  )
}
```

## Key Benefits

1. **End-to-end type safety** - Schema validation from API to UI
2. **Automatic error handling** - Errors flow through Result type
3. **No glue code** - Effect ecosystem works together natively
4. **Reactive updates** - Mutations automatically refresh queries via reactivity keys
5. **OpenAPI generation** - HttpApi can generate OpenAPI specs

## Integration Pattern

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Effect HttpApi │────▶│  Shared Schema  │◀────│  Effect Atom    │
│   (Backend)     │     │   Definitions   │     │   (Frontend)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
   Type-safe API          Domain Types           Reactive State
   Handlers               + Errors               + HTTP Client
```
