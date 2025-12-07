import { test, expect } from './fixtures/auth.js'

// Helper to delete goal if exists
async function deleteGoalIfExists(page: import('@playwright/test').Page) {
  // Wait for loading to finish
  await page.waitForTimeout(500)
  const deleteButton = page.locator('[title="Delete goal"]')
  if (await deleteButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await deleteButton.click()
    await page.click('button:has-text("Delete Goal")')
    // Wait for empty state to appear
    await expect(page.locator('button:has-text("Set Your Goal")')).toBeVisible({ timeout: 5000 })
  }
}

// Helper to ensure test user has weight data (required for goal progress)
async function ensureWeightDataExists(page: import('@playwright/test').Page) {
  await page.goto('/weight')
  const addButton = page.locator('button:has-text("Add Entry")')
  await expect(addButton).toBeVisible({ timeout: 5000 })

  // Check if there's already data
  const hasData = await page
    .locator('table tbody tr')
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false)
  if (hasData) return

  // Create weight entry
  await addButton.click()
  await page.fill('input#weight', '180')
  await page.fill('textarea#notes', 'E2E setup weight')
  await page.click('button:has-text("Save")')
  await expect(page.locator('td:has-text("E2E setup weight")').first()).toBeVisible({ timeout: 5000 })
}

// Run tests serially since they modify shared goal state
test.describe
  .serial('Goals', () => {
    test.beforeEach(async ({ authedPage: page }) => {
      // Ensure weight data exists (required for goal progress to show)
      await ensureWeightDataExists(page)
      await page.goto('/stats')
      // Wait for goal card to load
      await expect(page.locator('text=Goal Progress')).toBeVisible({ timeout: 10000 })
    })

    test('displays goal progress card', async ({ authedPage: page }) => {
      await expect(page.locator('text=Goal Progress')).toBeVisible()
    })

    test('shows empty state when no goal exists', async ({ authedPage: page }) => {
      // Clean up any existing goal first
      await deleteGoalIfExists(page)
      await expect(page.locator('text=Set a goal weight to track your progress!')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('button:has-text("Set Your Goal")')).toBeVisible()
    })

    test('opens goal form when Set Your Goal is clicked', async ({ authedPage: page }) => {
      await deleteGoalIfExists(page)
      await page.click('button:has-text("Set Your Goal")')
      await expect(page.locator('label:has-text("Goal Weight")')).toBeVisible()
      await expect(page.locator('label:has-text("Target Date")')).toBeVisible()
      await expect(page.locator('label:has-text("Notes")')).toBeVisible()
      await expect(page.locator('button:has-text("Cancel")')).toBeVisible()
      await expect(page.locator('button:has-text("Set Goal")')).toBeVisible()
    })

    test('can cancel form without saving', async ({ authedPage: page }) => {
      await deleteGoalIfExists(page)
      await page.click('button:has-text("Set Your Goal")')
      await expect(page.locator('label:has-text("Goal Weight")')).toBeVisible()
      await page.click('button:has-text("Cancel")')
      await expect(page.locator('label:has-text("Goal Weight")')).not.toBeVisible()
      await expect(page.locator('button:has-text("Set Your Goal")')).toBeVisible()
    })

    test('validates required goal weight field', async ({ authedPage: page }) => {
      await deleteGoalIfExists(page)
      await page.click('button:has-text("Set Your Goal")')
      await page.locator('input#goalWeight').focus()
      await page.locator('textarea#notes').focus()
      await expect(page.locator('text=Goal weight is required')).toBeVisible()
    })

    test('validates goal weight range', async ({ authedPage: page }) => {
      await deleteGoalIfExists(page)
      await page.click('button:has-text("Set Your Goal")')
      await page.fill('input#goalWeight', '1500')
      await page.locator('textarea#notes').focus()
      await expect(page.locator('text=Please enter a realistic weight')).toBeVisible()

      await page.fill('input#goalWeight', '0')
      await page.locator('textarea#notes').focus()
      await expect(page.locator('text=Must be greater than 0')).toBeVisible()
    })

    test('can create, edit, and delete a goal', async ({ authedPage: page }) => {
      // Clean up first
      await deleteGoalIfExists(page)

      // Create goal
      await page.click('button:has-text("Set Your Goal")')
      await page.fill('input#goalWeight', '150')
      await page.fill('textarea#notes', 'E2E test goal')
      await page.click('button:has-text("Set Goal")')

      // Verify goal was created - should show progress UI
      await expect(page.locator('text=Progress to goal')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('text=150.0 lbs')).toBeVisible()

      // Edit goal
      await page.click('[title="Edit goal"]')
      await expect(page.locator('button:has-text("Save Changes")')).toBeVisible()
      await page.fill('input#goalWeight', '145')
      await page.fill('textarea#notes', 'Updated E2E test goal')
      await page.click('button:has-text("Save Changes")')

      // Verify edit worked
      await expect(page.locator('text=145.0 lbs')).toBeVisible({ timeout: 5000 })

      // Delete goal
      await page.click('[title="Delete goal"]')
      await expect(page.locator('text=Delete this goal?')).toBeVisible()
      await page.click('button:has-text("Delete Goal")')

      // Verify deletion - empty state should appear
      await expect(page.locator('button:has-text("Set Your Goal")')).toBeVisible({ timeout: 5000 })
    })

    test('can cancel goal edit', async ({ authedPage: page }) => {
      await deleteGoalIfExists(page)

      // Create goal first
      await page.click('button:has-text("Set Your Goal")')
      await page.fill('input#goalWeight', '160')
      await page.click('button:has-text("Set Goal")')
      await expect(page.locator('text=Progress to goal')).toBeVisible({ timeout: 5000 })

      // Open edit form then cancel
      await page.click('[title="Edit goal"]')
      await expect(page.locator('button:has-text("Save Changes")')).toBeVisible()
      // Fill with a valid value that won't trigger validation error (must be less than current weight)
      await page.fill('input#goalWeight', '140')
      // Wait a moment then cancel
      await page.waitForTimeout(200)
      await page.click('button:has-text("Cancel")')

      // Wait for form to close
      await expect(page.locator('button:has-text("Save Changes")')).not.toBeVisible({ timeout: 5000 })

      // Original value should still be shown (goal weight in progress display)
      await expect(page.locator('text=Progress to goal')).toBeVisible({ timeout: 5000 })
      // The goal weight is shown in the progress bar area
      await expect(page.locator('span.font-mono:has-text("160.0 lbs")')).toBeVisible({ timeout: 5000 })

      // Cleanup
      await deleteGoalIfExists(page)
    })

    test('can cancel goal deletion', async ({ authedPage: page }) => {
      await deleteGoalIfExists(page)

      // Create goal first
      await page.click('button:has-text("Set Your Goal")')
      await page.fill('input#goalWeight', '155')
      await page.click('button:has-text("Set Goal")')
      await expect(page.locator('text=Progress to goal')).toBeVisible({ timeout: 5000 })

      // Open delete confirmation then cancel
      await page.click('[title="Delete goal"]')
      await expect(page.locator('text=Delete this goal?')).toBeVisible()
      await page.click('button:has-text("Cancel")')

      // Goal should still exist
      await expect(page.locator('text=Progress to goal')).toBeVisible()
      await expect(page.locator('text=155.0 lbs')).toBeVisible()

      // Cleanup
      await deleteGoalIfExists(page)
    })

    test('shows goal progress stats when goal exists', async ({ authedPage: page }) => {
      await deleteGoalIfExists(page)

      // Create goal
      await page.click('button:has-text("Set Your Goal")')
      await page.fill('input#goalWeight', '140')
      await page.click('button:has-text("Set Goal")')

      // Verify progress stats are shown
      await expect(page.locator('text=Progress to goal')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('span.text-xs:has-text("Lost")')).toBeVisible()
      await expect(page.locator('span.text-xs:has-text("To Go")')).toBeVisible()
      await expect(page.locator('span.text-xs:has-text("Avg/Week")')).toBeVisible()
      await expect(page.locator('span.text-xs:has-text("Days")')).toBeVisible()

      // Cleanup
      await deleteGoalIfExists(page)
    })
  })
