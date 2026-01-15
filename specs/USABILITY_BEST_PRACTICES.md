# Usability Best Practices

## 1. Navigation

### Home Link Required

Every page needs a clear path back to home/dashboard.

### Breadcrumbs for Nested Pages

```typescript
function WeightDetailPage() {
  return (
    <div>
      <Breadcrumbs>
        <BreadcrumbLink to="/dashboard">Dashboard</BreadcrumbLink>
        <BreadcrumbLink to="/weight">Weight</BreadcrumbLink>
        <BreadcrumbItem>Entry Details</BreadcrumbItem>
      </Breadcrumbs>
      ...
    </div>
  )
}
```

### Active Route Highlighting

Sidebar navigation must highlight the current route.

### Preserve Data on Back

Back button should not lose user's work. Use atoms or localStorage for form drafts.

## 2. Authentication Pages

### Required Elements

- Auto-focused email field
- Password show/hide toggle
- No confirm password field (reduce friction)
- Real-time password requirement indicators
- Easy switch between login/register
- Preserve values after failed attempts
- Caps Lock warning

### Example

```typescript
function LoginPage() {
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  return (
    <form>
      <Input
        ref={emailRef}
        type="email"
        autoComplete="email"
        label="Email"
      />
      <PasswordInput
        showToggle
        autoComplete="current-password"
        label="Password"
      />
      <Button type="submit">Sign In</Button>
      <Link to="/register">Need an account? Sign up</Link>
    </form>
  )
}
```

## 3. Empty States

Every empty state needs three components:
1. Visual element (icon or illustration)
2. Explanatory text
3. Action button

### Context-Specific Messages

```typescript
// Weight entries
<EmptyState
  icon={<ScaleIcon />}
  title="No weight entries yet"
  description="Start tracking your progress by adding your first entry."
  action={<Button onClick={openAddModal}>Add Entry</Button>}
/>

// Search results
<EmptyState
  icon={<SearchIcon />}
  title="No results found"
  description={`No entries match "${query}". Try a different search term.`}
  action={<Button onClick={clearSearch}>Clear Search</Button>}
/>
```

## 4. Loading States

### Skeleton Loaders

Match the actual layout:

```typescript
function EntriesListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 bg-gray-100 rounded animate-pulse">
          <div className="w-20 h-4 bg-gray-200 rounded" />
          <div className="w-32 h-4 bg-gray-200 rounded" />
          <div className="flex-1 h-4 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  )
}
```

### Button Loading State

```typescript
<Button disabled={isSubmitting}>
  {isSubmitting ? (
    <>
      <Spinner className="mr-2" />
      Saving...
    </>
  ) : (
    "Save"
  )}
</Button>
```

### Prevent Double Submission

Disable form submission while processing.

## 5. Error States

Errors must answer:
1. What happened
2. Why it happened (if known)
3. What to do next

### Bad vs Good

```typescript
// BAD
<Error message="An error occurred" />

// GOOD
<Error
  title="Couldn't save entry"
  description="The server is temporarily unavailable. Please try again in a few minutes."
  action={<Button onClick={retry}>Try Again</Button>}
/>
```

### Specific Error Messages

```typescript
// Duplicate email
<Error
  title="Email already registered"
  description="An account with this email already exists."
  action={<Link to="/login">Sign in instead</Link>}
/>

// Network failure
<Error
  title="Connection lost"
  description="Check your internet connection and try again."
  action={<Button onClick={retry}>Retry</Button>}
/>

// Validation error
<Error
  title="Invalid weight"
  description="Weight must be a positive number."
/>
```

## 6. Form Design

### Label-Input Connection

```typescript
<div>
  <label htmlFor="weight">Weight (lbs)</label>
  <input id="weight" type="number" />
</div>
```

### Mark Optional Fields (Not Required)

```typescript
<label>
  Notes <span className="text-gray-500">(optional)</span>
</label>
```

### Semantic Input Types

```typescript
<input type="email" />     // Email keyboard on mobile
<input type="number" />    // Numeric keyboard
<input type="date" />      // Native date picker
<input type="tel" />       // Phone keyboard
```

### Multi-Step Forms

For long forms, break into steps with progress indicator:

```typescript
<StepIndicator current={2} total={4} />
```

## 7. Accessibility

### Keyboard Navigation

All interactive elements must be keyboard accessible.

### Focus Indicators

Visible focus state for keyboard users:

```css
:focus-visible {
  outline: 2px solid blue;
  outline-offset: 2px;
}
```

### ARIA Labels

```typescript
<button aria-label="Close dialog">
  <XIcon />
</button>

<input aria-describedby="weight-help" />
<p id="weight-help">Enter your weight in pounds</p>
```

### Touch Targets

Minimum 44x44 pixels for touch targets.

## 8. Feedback & Confirmation

### Success Notifications

```typescript
toast.success("Entry saved successfully")
```

### Destructive Action Confirmation

```typescript
<ConfirmDialog
  title="Delete Entry?"
  description="This action cannot be undone."
  confirmLabel="Delete"
  confirmVariant="danger"
  onConfirm={handleDelete}
/>
```

### Unsaved Changes Warning

```typescript
const blocker = useBlocker(hasUnsavedChanges)

{blocker.state === "blocked" && (
  <ConfirmDialog
    title="Unsaved Changes"
    description="You have unsaved changes. Are you sure you want to leave?"
    onConfirm={blocker.proceed}
    onCancel={blocker.reset}
  />
)}
```

## Checklist

1. [ ] Every page has navigation back to home
2. [ ] Forms have proper labels and error messages
3. [ ] Authentication pages follow conventions
4. [ ] Empty states have icon + text + action
5. [ ] Loading states use skeletons matching layout
6. [ ] Errors explain what happened and what to do
7. [ ] Destructive actions require confirmation
8. [ ] All elements are keyboard accessible
9. [ ] Touch targets are at least 44x44px
