# Effect Atom - Reactivity Patterns

## Core Reactivity System

Atoms track dependencies through a node-based graph, propagate changes lazily, and manage subscriptions via a central Registry.

## Refresh and Invalidation Patterns

### Using useAtomRefresh

```typescript
const entriesAtom = runtime.atom(WeightService.getEntries)
const refresh = useAtomRefresh(entriesAtom)

// Manual refresh after action
const handleDelete = async () => {
  await deleteEntry(id)
  refresh()
}
```

### Reactivity Keys for Automatic Invalidation

```typescript
// Query atom with reactivity key
const entriesQuery = runtime.atom(WeightService.getEntries, {
  reactivityKeys: ["weight-entries"]
})

// Mutation that triggers refresh
const addEntry = runtime.fn(WeightService.addEntry, {
  reactivityKeys: ["weight-entries"]
})
```

## Query and Mutation Patterns

### Read Operations (Queries)

Queries return `Result<A, E>` representing async states:

```typescript
const entriesAtom = runtime.atom(WeightService.getEntries)

function EntriesList() {
  const entries = useAtom(entriesAtom)

  return Result.match(entries, {
    onInitial: () => <Loading />,
    onWaiting: () => <Loading />,
    onFailure: (error) => <Error error={error} />,
    onSuccess: (data) => <List items={data} />
  })
}
```

### Write Operations (Mutations)

Three patterns for mutations:

**1. Fire-and-Forget with Reactivity Keys**

```typescript
const addEntry = runtime.fn(WeightService.addEntry, {
  reactivityKeys: ["weight-entries"]
})

function AddButton() {
  const add = useAtomFn(addEntry)
  return <button onClick={() => add(newEntry)}>Add</button>
}
```

**2. Reacting to Success**

```typescript
const addEntry = runtime.fn(WeightService.addEntry)

function AddForm() {
  const [result, add] = useAtomFnWithResult(addEntry)

  useEffect(() => {
    if (Result.isSuccess(result)) {
      toast.success("Entry added")
      closeModal()
    }
  }, [result])

  return <form onSubmit={() => add(formData)}>...</form>
}
```

**3. Awaiting with Promise Mode**

```typescript
const addEntry = runtime.fn(WeightService.addEntry, {
  mode: "promise"
})

function AddForm() {
  const add = useAtomFn(addEntry)

  const handleSubmit = async () => {
    try {
      await add(formData)
      toast.success("Entry added")
    } catch (e) {
      toast.error("Failed to add entry")
    }
  }
}
```

## Anti-Patterns to Avoid

### Never Do Full Page Reloads

```typescript
// BAD
window.location.reload()

// GOOD - use reactivity keys or manual refresh
refresh()
```

### Avoid the refreshKey State Pattern

```typescript
// BAD - causes unnecessary re-renders
const [refreshKey, setRefreshKey] = useState(0)
const entries = useAtom(useMemo(() => entriesAtom, [refreshKey]))

// GOOD - use useAtomRefresh
const entries = useAtom(entriesAtom)
const refresh = useAtomRefresh(entriesAtom)
```

### Never Create Atoms in Render

```typescript
// BAD - creates new atom every render
function Component({ id }) {
  const entry = useAtom(runtime.atom(getEntry(id)))
}

// GOOD - use Atom.family
const entryFamily = Atom.family((id: string) =>
  runtime.atom(getEntry(id))
)

function Component({ id }) {
  const entry = useAtom(entryFamily(id))
}
```

## Best Practices

1. Define atoms at module level
2. Use `Atom.family` for parameterized atoms
3. Properly handle all Result states (Initial, Waiting, Failure, Success)
4. Select mutation patterns based on use case

## Result Type

The Result ADT has four states:

```typescript
type Result<A, E> =
  | { _tag: "Initial" }
  | { _tag: "Waiting", previous?: A }
  | { _tag: "Success", value: A }
  | { _tag: "Failure", error: E }
```

Use `Result.match` for exhaustive handling:

```typescript
Result.match(result, {
  onInitial: () => ...,
  onWaiting: (prev) => ...,
  onSuccess: (value) => ...,
  onFailure: (error) => ...
})
```

## Advanced Patterns

### Optimistic Updates

```typescript
const updateEntry = runtime.fn(
  (entry: WeightEntry) =>
    Effect.gen(function* () {
      // Optimistically update local state
      yield* Ref.update(entriesRef, entries =>
        entries.map(e => e.id === entry.id ? entry : e)
      )
      // Then persist
      yield* WeightService.updateEntry(entry)
    }),
  { reactivityKeys: ["weight-entries"] }
)
```

### Pagination with pull()

```typescript
const entriesAtom = runtime.atom(
  WeightService.getEntriesPaginated,
  { pull: true }
)

function EntriesList() {
  const [entries, pull] = useAtomPull(entriesAtom)

  return (
    <>
      <List items={entries} />
      <button onClick={pull}>Load More</button>
    </>
  )
}
```

### Debounced Search

```typescript
const searchAtom = Atom.family((query: string) =>
  runtime.atom(
    WeightService.search(query),
    { debounce: Duration.millis(300) }
  )
)
```
