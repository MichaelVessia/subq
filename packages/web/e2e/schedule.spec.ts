import { test, expect } from './fixtures/auth.js'

test.describe('Schedule', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto('/schedule')
  })

  test('displays schedule page with header and new schedule button', async ({ authedPage: page }) => {
    await expect(page.locator('h2:has-text("Injection Schedule")')).toBeVisible()
    await expect(page.locator('button:has-text("New Schedule")')).toBeVisible()
  })

  test('opens form when New Schedule is clicked', async ({ authedPage: page }) => {
    await page.click('button:has-text("New Schedule")')
    await expect(page.locator('label:has-text("Schedule Name")')).toBeVisible()
    await expect(page.locator('label:has-text("Medication")')).toBeVisible()
    await expect(page.locator('label:has-text("Frequency")')).toBeVisible()
    await expect(page.locator('label:has-text("Start Date")')).toBeVisible()
    await expect(page.locator('label:has-text("Titration Phases")')).toBeVisible()
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible()
    await expect(page.locator('button:has-text("Create Schedule")')).toBeVisible()
  })

  test('can cancel form without saving', async ({ authedPage: page }) => {
    await page.click('button:has-text("New Schedule")')
    await expect(page.locator('label:has-text("Schedule Name")')).toBeVisible()
    await page.click('button:has-text("Cancel")')
    await expect(page.locator('label:has-text("Schedule Name")')).not.toBeVisible()
  })

  test('shows frequency options', async ({ authedPage: page }) => {
    await page.click('button:has-text("New Schedule")')
    const frequencySelect = page.locator('select#frequency')
    // Verify by selecting each option
    await frequencySelect.selectOption('daily')
    await expect(frequencySelect).toHaveValue('daily')
    await frequencySelect.selectOption('weekly')
    await expect(frequencySelect).toHaveValue('weekly')
    await frequencySelect.selectOption('monthly')
    await expect(frequencySelect).toHaveValue('monthly')
  })

  test('starts with one phase', async ({ authedPage: page }) => {
    await page.click('button:has-text("New Schedule")')
    await expect(page.locator('text=Phase 1')).toBeVisible()
    // Should not have Phase 2 initially
    await expect(page.locator('text=Phase 2')).not.toBeVisible()
  })

  test('can add phases', async ({ authedPage: page }) => {
    await page.click('button:has-text("New Schedule")')
    await page.click('button:has-text("Add Phase")')
    await expect(page.locator('text=Phase 2')).toBeVisible()

    await page.click('button:has-text("Add Phase")')
    await expect(page.locator('text=Phase 3')).toBeVisible()
  })

  test('can remove phases', async ({ authedPage: page }) => {
    await page.click('button:has-text("New Schedule")')
    await page.click('button:has-text("Add Phase")')
    await expect(page.locator('text=Phase 2')).toBeVisible()

    // Remove second phase (trash button)
    await page.locator('.bg-muted\\/50').last().locator('button:has(svg)').click()
    await expect(page.locator('text=Phase 2')).not.toBeVisible()
  })

  test('shows indefinite checkbox only on last phase', async ({ authedPage: page }) => {
    await page.click('button:has-text("New Schedule")')

    // First phase (only phase) should have indefinite checkbox
    await expect(page.locator('label:has-text("Indefinite")')).toBeVisible()

    // Add second phase
    await page.click('button:has-text("Add Phase")')

    // Only second phase should have indefinite checkbox
    const indefiniteCheckboxes = page.locator('label:has-text("Indefinite")')
    await expect(indefiniteCheckboxes).toHaveCount(1)
  })

  test('indefinite checkbox disables duration field', async ({ authedPage: page }) => {
    await page.click('button:has-text("New Schedule")')

    const daysInput = page.locator('.bg-muted\\/50').first().locator('input[type="number"]')
    const indefiniteCheckbox = page.locator('label:has-text("Indefinite") input')

    // Initially enabled
    await expect(daysInput).not.toBeDisabled()

    // Check indefinite
    await indefiniteCheckbox.check()
    await expect(daysInput).toBeDisabled()

    // Uncheck indefinite
    await indefiniteCheckbox.uncheck()
    await expect(daysInput).not.toBeDisabled()
  })

  test('can create a new schedule', async ({ authedPage: page }) => {
    const scheduleName = `E2E Schedule ${Date.now()}`
    await page.click('button:has-text("New Schedule")')

    // Fill form
    await page.fill('input#name', scheduleName)
    await page.selectOption('select#drug', { label: 'Semaglutide (Ozempic)' })
    await page.selectOption('select#frequency', 'weekly')

    // Fill phase
    await page.locator('.bg-muted\\/50 input[placeholder*="Dosage"]').fill('0.25mg')
    await page.locator('.bg-muted\\/50 input[type="number"]').fill('28')

    // Create
    await page.click('button:has-text("Create Schedule")')

    // Should see new schedule card
    await expect(page.locator(`h3:has-text("${scheduleName}")`)).toBeVisible({ timeout: 5000 })
  })

  test('schedule card shows phase information', async ({ authedPage: page }) => {
    // Demo account should have a schedule
    const scheduleCard = page.locator('.space-y-4 > div').first()
    if (await scheduleCard.isVisible()) {
      // Should show phase dosages
      await expect(scheduleCard.locator('.font-mono')).toBeVisible()
    }
  })

  test('can edit a schedule', async ({ authedPage: page }) => {
    // Demo account should have schedules
    const editButton = page.locator('button:has(svg.lucide-edit)').first()
    if (await editButton.isVisible()) {
      await editButton.click()
      await expect(page.locator('button:has-text("Update Schedule")')).toBeVisible()

      // Update name
      await page.fill('input#name', 'Updated Schedule Name')
      await page.click('button:has-text("Update Schedule")')

      await expect(page.locator('h3:has-text("Updated Schedule Name")')).toBeVisible({ timeout: 5000 })
    }
  })

  test('can delete a schedule', async ({ authedPage: page }) => {
    const scheduleName = `Delete Schedule ${Date.now()}`

    // First create a schedule to delete
    await page.click('button:has-text("New Schedule")')
    await page.fill('input#name', scheduleName)
    await page.selectOption('select#drug', { label: 'Tirzepatide (Mounjaro)' })
    await page.locator('.bg-muted\\/50 input[placeholder*="Dosage"]').fill('2.5mg')
    await page.locator('.bg-muted\\/50 input[type="number"]').fill('28')
    await page.click('button:has-text("Create Schedule")')
    await expect(page.locator(`h3:has-text("${scheduleName}")`)).toBeVisible({ timeout: 5000 })

    // Override confirm dialog
    await page.evaluate(() => {
      window.confirm = () => true
    })

    // Find the h3 then navigate up to find the sibling delete button
    // Structure: div.flex > div > div.flex > h3 AND div.flex > div.flex > button.text-destructive
    // Use filter to get card containing the schedule name
    const card = page.locator('.space-y-4 > div').filter({ has: page.locator(`h3:has-text("${scheduleName}")`) })
    await card.locator('button.text-destructive').click()

    await expect(page.locator(`h3:has-text("${scheduleName}")`)).not.toBeVisible({ timeout: 5000 })
  })

  test('can activate a schedule', async ({ authedPage: page }) => {
    const scheduleName = `Activate Schedule ${Date.now()}`

    // Create a new schedule that won't be active
    await page.click('button:has-text("New Schedule")')
    await page.fill('input#name', scheduleName)
    await page.selectOption('select#drug', { label: 'Semaglutide (Wegovy)' })
    await page.locator('.bg-muted\\/50 input[placeholder*="Dosage"]').fill('0.5mg')
    await page.locator('.bg-muted\\/50 input[type="number"]').fill('28')
    await page.click('button:has-text("Create Schedule")')
    await expect(page.locator(`h3:has-text("${scheduleName}")`)).toBeVisible({ timeout: 5000 })

    // Use filter to get card containing the schedule name
    const card = page.locator('.space-y-4 > div').filter({ has: page.locator(`h3:has-text("${scheduleName}")`) })
    const activateBtn = card.locator('button:has-text("Activate")')

    if (await activateBtn.isVisible()) {
      await activateBtn.click()
      // Should now show Active badge
      await expect(card.locator('text=Active')).toBeVisible({ timeout: 5000 })
    }
  })

  test('can navigate to schedule detail page', async ({ authedPage: page }) => {
    // Demo account should have schedules
    const viewButton = page.locator('button:has(svg.lucide-eye)').first()
    if (await viewButton.isVisible()) {
      await viewButton.click()
      await expect(page).toHaveURL(/\/schedule\//)
    }
  })

  test('schedule detail page shows schedule info', async ({ authedPage: page }) => {
    // Navigate via view button
    const viewButton = page.locator('button:has(svg.lucide-eye)').first()
    if (await viewButton.isVisible()) {
      await viewButton.click()
      // Should show schedule details
      await expect(page.locator('h2')).toBeVisible()
    }
  })
})
