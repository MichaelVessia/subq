# React Best Practices Remediation Spec

## Overview

Bring existing React components into compliance with `specs/REACT_BEST_PRACTICES.md`. Audit found 18+ violations across 6 files.

## Success Criteria

- [ ] All forms use react-hook-form with standardSchemaResolver
- [ ] No useState for loading/error/success states
- [ ] No useMemo for atom creation
- [ ] StatsPage uses Atom.family for parameterized data
- [ ] Unit tests for migrated form schemas

## Out of Scope

- New feature development
- Styling changes
- API changes
- injection-log-form.tsx useMemo (acceptable pattern: deriving from atom data with local state)

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| schedule-form phases array | useFieldArray | Full RHF integration, cleaner validation |
| StatsPage atom creation | Atom.family | Proper caching for date-range parameterized data |
| Async state atoms location | rpc.ts | Centralized with other data atoms |
| goal-form cross-field validation | RHF validate option | Simplest approach for dynamic currentWeight comparison |
| injection-log-form useMemo | Leave as-is | Deriving from atom data with local form state is acceptable |
| Testing | Unit tests | Test schema validation for migrated forms |

## Phase 1: Form Migration

Migrate manual form validation to react-hook-form pattern.

### 1.1 goal-form.tsx

**File:** `packages/web/src/components/goals/goal-form.tsx`

**Current:** Manual useState for each field, custom validation, loading/error/touched states
**Target:** react-hook-form + standardSchemaResolver + Effect Schema

Changes:
- Create `GoalFormSchema` in `packages/web/src/lib/form-schemas.ts`:
  - `goalWeight`: String, required, positive number, max 1000
  - `startDate`: String, optional date
  - `targetDate`: String, optional date (must be future if provided)
  - `notes`: String, optional
- Remove useState for: goalWeight, startDate, targetDate, notes, loading, errors, touched
- Use `useForm` with `standardSchemaResolver(goalFormStandardSchema)`
- Use `formState.isSubmitting` instead of loading state
- Use `formState.errors` instead of errors state
- Cross-field validation (goal weight < current weight): Use RHF's field-level `validate` callback
  ```typescript
  register('goalWeight', {
    validate: (value) => {
      if (currentWeight && parseFloat(value) >= displayWeight(currentWeight)) {
        return 'Goal weight should be less than current weight'
      }
      return true
    }
  })
  ```

### 1.2 schedule-form.tsx

**File:** `packages/web/src/components/schedule/schedule-form.tsx`

**Current:** Manual useState for all fields including phases array, custom validation
**Target:** react-hook-form with useFieldArray for phases

Changes:
- Create `ScheduleFormSchema` in `packages/web/src/lib/form-schemas.ts`:
  - `name`: String, required, non-empty
  - `drug`: String, required, non-empty
  - `frequency`: Literal union of frequency values
  - `startDate`: String, required, valid date
  - `notes`: String, optional
  - `phases`: Array of phase objects (order, durationDays, dosage, isIndefinite)
- Create `SchedulePhaseSchema` for nested phase validation
- Remove useState for: name, drug, frequency, startDate, notes, phases, loading, errors, touched
- Use `useFieldArray` for phases:
  ```typescript
  const { fields, append, remove } = useFieldArray({ control, name: 'phases' })
  ```
- Phase validation: Only last phase can be indefinite, all must have dosage

### 1.3 change-password-form.tsx

**File:** `packages/web/src/components/settings/change-password-form.tsx`

**Current:** Manual useState for passwords and feedback
**Target:** react-hook-form + Effect Schema

Changes:
- Create `ChangePasswordFormSchema` in `packages/web/src/lib/form-schemas.ts`:
  - `currentPassword`: String, required
  - `newPassword`: String, required, min length
  - `confirmPassword`: String, required
- Add schema refinement for confirmPassword === newPassword
- Remove useState for: currentPassword, newPassword, confirmPassword, error, success, loading
- Handle success via callback prop (parent component manages success state)
- Use `formState.isSubmitting` for loading
- Use `setError` for server-side errors

### Phase 1 Testing

Add tests in `packages/web/src/lib/form-schemas.test.ts`:
- GoalFormSchema: valid inputs, invalid weight, future date validation
- ScheduleFormSchema: valid schedule, missing required fields, phase validation
- ChangePasswordFormSchema: password match validation

### Phase 1 Checkpoint

- [ ] GoalFormSchema created and tested
- [ ] goal-form.tsx migrated and compiles
- [ ] ScheduleFormSchema created and tested
- [ ] schedule-form.tsx migrated and compiles
- [ ] ChangePasswordFormSchema created and tested
- [ ] change-password-form.tsx migrated and compiles
- [ ] Manual testing of all 3 forms

## Phase 2: State Management Cleanup

### 2.1 data-management.tsx

**File:** `packages/web/src/components/settings/data-management.tsx`

**Current:** useState for isExporting, isImporting, importError, importSuccess, showConfirm, pendingImportData
**Target:** Move async operation states to atoms in rpc.ts

Changes in `packages/web/src/rpc.ts`:
- Create `DataOperationState` type:
  ```typescript
  type DataOperationState =
    | { status: 'idle' }
    | { status: 'pending' }
    | { status: 'success'; message?: string }
    | { status: 'error'; error: string }
  ```
- Create `exportOperationAtom`: Atom for export state
- Create `importOperationAtom`: Atom for import state
- Create action atoms for triggering operations

Changes in `data-management.tsx`:
- Remove useState for: isExporting, isImporting, importError, importSuccess
- Keep `showConfirm` as local state (modal toggle is acceptable)
- Keep `pendingImportData` as local state (temporary before confirmation)
- Use atoms for operation states
- Clear operation state on component unmount or new operation start

### Phase 2 Checkpoint

- [ ] DataOperationState atoms created in rpc.ts
- [ ] data-management.tsx migrated and compiles
- [ ] Export operation works correctly
- [ ] Import operation works correctly
- [ ] Error states display properly

## Phase 3: StatsPage Atom.family Migration

### 3.1 StatsPage.tsx

**File:** `packages/web/src/components/stats/StatsPage.tsx`

**Current Issues:**
1. useMemo to create atoms per date range (8 atoms created with useMemo)
2. useMemo for data transformation (weightData, injectionData, schedulePeriods)

**Target:**
1. Atom.family for parameterized stats atoms
2. Derived atoms for data transformations

Changes in `packages/web/src/rpc.ts`:
- Create date range key helper: `const dateRangeKey = (start: Date, end: Date) => \`${start.toISOString()}-${end.toISOString()}\``
- Convert existing `createXxxAtom` functions to `Atom.family`:
  ```typescript
  export const WeightStatsAtomFamily = Atom.family((key: string) => {
    const [start, end] = parseDateRangeKey(key)
    return // existing atom creation logic
  })
  ```
- Create families for all 8 stats atoms:
  - WeightStatsAtomFamily
  - WeightTrendAtomFamily
  - InjectionLogListAtomFamily
  - InjectionSiteStatsAtomFamily
  - DosageHistoryAtomFamily
  - InjectionFrequencyAtomFamily
  - DrugBreakdownAtomFamily
  - InjectionByDayOfWeekAtomFamily

Changes in `StatsPage.tsx`:
- Replace useMemo atom creation with family lookups:
  ```typescript
  const key = dateRangeKey(range.start, range.end)
  const weightStats = useAtomValue(WeightStatsAtomFamily(key))
  ```
- Keep `weightData`, `injectionData`, `schedulePeriods` as useMemo (these transform atom data for chart rendering, acceptable pattern)

**Note:** The useMemo for `weightData`, `injectionData`, and `schedulePeriods` transforms atom results into chart-specific formats. This is acceptable per best practices (similar to injection-log-form pattern). These are NOT creating atoms, just transforming data.

### Phase 3 Checkpoint

- [ ] Atom.family variants created in rpc.ts
- [ ] StatsPage migrated to use families
- [ ] No useMemo for atom creation remains
- [ ] Charts render correctly with all date ranges
- [ ] Verify caching works (switching between presets reuses cached atoms)

## Verification Commands

```bash
# Type check
cd packages/web && bun run typecheck

# Run tests (new schema tests)
cd packages/web && bun test form-schemas

# Run all tests
cd packages/web && bun test

# Manual testing
bun run dev
# Test each form: goals, schedules, change password, data import/export
# Test stats page renders correctly with different date ranges
```

## File Summary

| File | Phase | Changes |
|------|-------|---------|
| form-schemas.ts | 1 | Add GoalFormSchema, ScheduleFormSchema, ChangePasswordFormSchema |
| form-schemas.test.ts | 1 | Add unit tests for new schemas |
| goal-form.tsx | 1 | react-hook-form migration |
| schedule-form.tsx | 1 | react-hook-form + useFieldArray |
| change-password-form.tsx | 1 | react-hook-form migration |
| rpc.ts | 2, 3 | Add DataOperationState atoms, convert to Atom.family |
| data-management.tsx | 2 | Use operation state atoms |
| StatsPage.tsx | 3 | Use Atom.family instead of useMemo atom creation |

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| useFieldArray complexity for phases | Follow existing patterns in codebase, test thoroughly |
| Atom.family key serialization | Use ISO date strings, add helper functions |
| Breaking form behavior | Keep validation logic identical, only change state management |
| Performance regression in StatsPage | Atom.family provides caching, should improve performance |
