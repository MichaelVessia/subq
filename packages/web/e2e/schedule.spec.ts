import { test, expect } from './fixtures/auth.js'

// Helper to delete schedule
async function deleteSchedule(page: import('@playwright/test').Page, scheduleName: string) {
  const card = page.locator('.space-y-4 > div').filter({ has: page.locator(`h3:has-text("${scheduleName}")`) })
  await page.evaluate(() => {
    window.confirm = () => true
  })
  await card.locator('button.text-destructive').click()
  await expect(page.locator(`h3:has-text("${scheduleName}")`)).not.toBeVisible({ timeout: 5000 })
}

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
    await expect(page.locator('form button[type="submit"]:has-text("Create Schedule")')).toBeVisible()
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
    await expect(page.locator('text=Phase 2')).not.toBeVisible()
  })

  test('can add and remove phases', async ({ authedPage: page }) => {
    await page.click('button:has-text("New Schedule")')
    await page.click('button:has-text("Add Phase")')
    await expect(page.locator('text=Phase 2')).toBeVisible()
    await page.click('button:has-text("Add Phase")')
    await expect(page.locator('text=Phase 3')).toBeVisible()

    // Remove last phase
    await page.locator('.bg-muted\\/50').last().locator('button:has(svg)').click()
    await expect(page.locator('text=Phase 3')).not.toBeVisible()
  })

  test('shows indefinite checkbox only on last phase', async ({ authedPage: page }) => {
    await page.click('button:has-text("New Schedule")')
    await expect(page.locator('label:has-text("Indefinite")')).toBeVisible()
    await page.click('button:has-text("Add Phase")')
    const indefiniteCheckboxes = page.locator('label:has-text("Indefinite")')
    await expect(indefiniteCheckboxes).toHaveCount(1)
  })

  test('indefinite checkbox disables duration field', async ({ authedPage: page }) => {
    await page.click('button:has-text("New Schedule")')
    const daysInput = page.locator('.bg-muted\\/50').first().locator('input[type="number"]')
    const indefiniteCheckbox = page.locator('label:has-text("Indefinite") input')
    await expect(daysInput).not.toBeDisabled()
    await indefiniteCheckbox.check()
    await expect(daysInput).toBeDisabled()
    await indefiniteCheckbox.uncheck()
    await expect(daysInput).not.toBeDisabled()
  })

  test('can create and delete schedule', async ({ authedPage: page }) => {
    const scheduleName = `E2E Schedule ${Date.now()}`

    // Create
    await page.click('button:has-text("New Schedule")')
    await page.fill('input#name', scheduleName)
    await page.selectOption('select#drug', { label: 'Semaglutide (Ozempic)' })
    await page.selectOption('select#frequency', 'weekly')
    await page.locator('.bg-muted\\/50 input[placeholder*="Dosage"]').fill('0.25mg')
    await page.locator('.bg-muted\\/50 input[type="number"]').fill('28')
    await page.click('button:has-text("Create Schedule")')
    await expect(page.locator(`h3:has-text("${scheduleName}")`)).toBeVisible({ timeout: 5000 })

    // Cleanup
    await deleteSchedule(page, scheduleName)
  })

  test('can edit and delete schedule', async ({ authedPage: page }) => {
    const scheduleName = `Edit Schedule ${Date.now()}`
    const updatedName = `Updated Schedule ${Date.now()}`

    // Create
    await page.click('button:has-text("New Schedule")')
    await page.fill('input#name', scheduleName)
    await page.selectOption('select#drug', { label: 'Tirzepatide (Mounjaro)' })
    await page.locator('.bg-muted\\/50 input[placeholder*="Dosage"]').fill('2.5mg')
    await page.locator('.bg-muted\\/50 input[type="number"]').fill('28')
    await page.click('button:has-text("Create Schedule")')
    await expect(page.locator(`h3:has-text("${scheduleName}")`)).toBeVisible({ timeout: 5000 })

    // Edit
    const card = page.locator('.space-y-4 > div').filter({ has: page.locator(`h3:has-text("${scheduleName}")`) })
    await card.locator('button:has(svg.lucide-edit)').click()
    await expect(page.locator('button:has-text("Update Schedule")')).toBeVisible()
    await page.fill('input#name', updatedName)
    await page.click('button:has-text("Update Schedule")')
    await expect(page.locator(`h3:has-text("${updatedName}")`)).toBeVisible({ timeout: 5000 })

    // Cleanup
    await deleteSchedule(page, updatedName)
  })

  test('can activate and delete schedule', async ({ authedPage: page }) => {
    const scheduleName = `Activate Schedule ${Date.now()}`

    // Create
    await page.click('button:has-text("New Schedule")')
    await page.fill('input#name', scheduleName)
    await page.selectOption('select#drug', { label: 'Semaglutide (Wegovy)' })
    await page.locator('.bg-muted\\/50 input[placeholder*="Dosage"]').fill('0.5mg')
    await page.locator('.bg-muted\\/50 input[type="number"]').fill('28')
    await page.click('button:has-text("Create Schedule")')
    await expect(page.locator(`h3:has-text("${scheduleName}")`)).toBeVisible({ timeout: 5000 })

    // Activate
    const card = page.locator('.space-y-4 > div').filter({ has: page.locator(`h3:has-text("${scheduleName}")`) })
    const activateBtn = card.locator('button:has-text("Activate")')
    if (await activateBtn.isVisible()) {
      await activateBtn.click()
      await expect(card.locator('text=Active')).toBeVisible({ timeout: 5000 })
    }

    // Cleanup
    await deleteSchedule(page, scheduleName)
  })

  test('can navigate to schedule detail page', async ({ authedPage: page }) => {
    const scheduleName = `View Schedule ${Date.now()}`

    // Create
    await page.click('button:has-text("New Schedule")')
    await page.fill('input#name', scheduleName)
    await page.selectOption('select#drug', { label: 'Semaglutide (Ozempic)' })
    await page.locator('.bg-muted\\/50 input[placeholder*="Dosage"]').fill('0.25mg')
    await page.locator('.bg-muted\\/50 input[type="number"]').fill('28')
    await page.click('button:has-text("Create Schedule")')
    await expect(page.locator(`h3:has-text("${scheduleName}")`)).toBeVisible({ timeout: 5000 })

    // Navigate to detail
    const card = page.locator('.space-y-4 > div').filter({ has: page.locator(`h3:has-text("${scheduleName}")`) })
    await card.locator('button:has(svg.lucide-eye)').click()
    await expect(page).toHaveURL(/\/schedule\//)
    await expect(page.locator('h2')).toBeVisible()

    // Go back and cleanup
    await page.goto('/schedule')
    await deleteSchedule(page, scheduleName)
  })
})
