# React Best Practices

## 1. State Management: Effect Atom First

All application state should live in atoms, not React state. `useState` is acceptable only for truly local, ephemeral UI state.

### Acceptable useState

```typescript
// Form input before submission
const [draft, setDraft] = useState("")

// Hover/focus state
const [isHovered, setIsHovered] = useState(false)

// Animation state
const [isAnimating, setIsAnimating] = useState(false)

// Local open/close state
const [isOpen, setIsOpen] = useState(false)
```

### Use Atoms Instead

```typescript
// BAD - loading state in React
const [isLoading, setIsLoading] = useState(false)
const [data, setData] = useState<Entry[]>([])
const [error, setError] = useState<Error | null>(null)

// GOOD - let atoms handle async state
const entries = useAtom(entriesAtom)
Result.match(entries, {
  onInitial: () => <Loading />,
  onWaiting: () => <Loading />,
  onSuccess: (data) => <List items={data} />,
  onFailure: (error) => <Error error={error} />
})
```

### Anti-Patterns

Never use `useState` for:
- Loading states
- Error states
- Data collections
- Filters/pagination
- Modal visibility (unless truly local)
- Selection state

## 2. Styling: Tailwind CSS

### Prevent FOUC

Import CSS with `?url` suffix in route definitions:

```typescript
// routes/__root.tsx
import styles from "../styles/app.css?url"

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: "stylesheet", href: styles }]
  })
})
```

### Class Organization

```typescript
// Logical grouping: layout → spacing → typography → colors → effects
<div className="flex flex-col gap-4 p-4 text-sm text-gray-800 bg-white rounded-lg shadow">
```

### Conditional Classes

```typescript
import { clsx } from "clsx"

<button
  className={clsx(
    "px-4 py-2 rounded font-medium",
    isActive && "bg-blue-500 text-white",
    isDisabled && "opacity-50 cursor-not-allowed"
  )}
>
```

### Component Variants with CVA

```typescript
import { cva, type VariantProps } from "class-variance-authority"

const buttonVariants = cva(
  "px-4 py-2 rounded font-medium transition-colors",
  {
    variants: {
      variant: {
        primary: "bg-blue-500 text-white hover:bg-blue-600",
        secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300",
        danger: "bg-red-500 text-white hover:bg-red-600"
      },
      size: {
        sm: "text-sm px-3 py-1",
        md: "text-base px-4 py-2",
        lg: "text-lg px-6 py-3"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "md"
    }
  }
)

interface ButtonProps extends VariantProps<typeof buttonVariants> {
  children: React.ReactNode
}

function Button({ variant, size, children }: ButtonProps) {
  return <button className={buttonVariants({ variant, size })}>{children}</button>
}
```

## 3. Component Patterns

### Result-Driven Rendering

Handle all four states of Result:

```typescript
function EntriesList() {
  const entries = useAtom(entriesAtom)

  return Result.match(entries, {
    onInitial: () => <Skeleton />,
    onWaiting: (prev) => (
      <>
        {prev && <List items={prev} />}
        <LoadingOverlay />
      </>
    ),
    onFailure: (error) => (
      <ErrorState
        error={error}
        retry={() => refresh()}
      />
    ),
    onSuccess: (data) =>
      data.length === 0 ? <EmptyState /> : <List items={data} />
  })
}
```

### Container vs Presentational

```typescript
// Container: handles data fetching and state
function WeightPageContainer() {
  const entries = useAtom(weightEntriesAtom)
  const createEntry = useAtomFn(createWeightEntryAtom)

  return (
    <WeightPage
      entries={entries}
      onCreateEntry={createEntry}
    />
  )
}

// Presentational: pure rendering
interface WeightPageProps {
  entries: Result<WeightEntry[], Error>
  onCreateEntry: (data: CreateWeightEntry) => void
}

function WeightPage({ entries, onCreateEntry }: WeightPageProps) {
  return (
    <div>
      <WeightForm onSubmit={onCreateEntry} />
      {Result.match(entries, { ... })}
    </div>
  )
}
```

### Composition Over Prop Drilling

```typescript
// BAD - prop drilling
function App() {
  return <Layout user={user} theme={theme}>
    <Sidebar user={user} theme={theme}>
      <Nav user={user} theme={theme} />
    </Sidebar>
  </Layout>
}

// GOOD - composition with atoms
function App() {
  return (
    <Layout>
      <Sidebar>
        <Nav />
      </Sidebar>
    </Layout>
  )
}

// Components read what they need from atoms
function Nav() {
  const user = useAtom(userAtom)
  const theme = useAtom(themeAtom)
  // ...
}
```

## 4. Form Handling

Use react-hook-form with Effect Schema validation:

```typescript
import { useForm } from "react-hook-form"
import { effectResolver } from "@hookform/resolvers/effect"
import { Schema } from "effect"

const WeightEntryForm = Schema.Struct({
  weight: Schema.Number.pipe(Schema.positive()),
  date: Schema.DateTimeUtc,
  notes: Schema.optional(Schema.String)
})

function AddWeightForm() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: effectResolver(WeightEntryForm)
  })

  const createEntry = useAtomFn(createWeightEntryAtom)

  return (
    <form onSubmit={handleSubmit(createEntry)}>
      <input {...register("weight")} type="number" step="0.1" />
      {errors.weight && <span>{errors.weight.message}</span>}
      ...
    </form>
  )
}
```

## 5. Performance Patterns

### Memoize in Atoms, Not Components

```typescript
// BAD - memoizing in component
function Dashboard() {
  const entries = useAtom(entriesAtom)
  const stats = useMemo(() =>
    computeExpensiveStats(Result.getOrElse(entries, () => [])),
    [entries]
  )
}

// GOOD - compute in atom
const statsAtom = Atom.derived((get) => {
  const entries = get(entriesAtom)
  return Result.map(entries, computeExpensiveStats)
})

function Dashboard() {
  const stats = useAtom(statsAtom)
}
```

### Use Atom.family for Parameterized Data

```typescript
// Stable reference for each ID
const entryFamily = Atom.family((id: string) =>
  api.weight.get({ urlParams: { id } })
)

function EntryRow({ id }: { id: string }) {
  const entry = useAtom(entryFamily(id))
  // ...
}
```

### Avoid Inline Object/Array Creation in Atoms

```typescript
// BAD - creates new object every render
const entry = useAtom(entryFamily({ id: props.id, userId: props.userId }))

// GOOD - use stable key
const entryKey = `${props.id}-${props.userId}`
const entry = useAtom(entryFamily(entryKey))
```

## 6. Summary

| Recommended | Anti-Pattern |
|-------------|--------------|
| Effect Atom for all app state | useState for loading/error/data |
| Result.match for async states | Manual loading/error states |
| Atoms for computed values | useMemo in components |
| Atom.family for params | Inline atom creation |
| Container/Presentational split | Giant components with mixed concerns |
| CSS imports with ?url | Side-effect CSS imports |
