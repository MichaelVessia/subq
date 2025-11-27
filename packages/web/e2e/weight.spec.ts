import { test, expect } from './fixtures/auth.js'

test.describe('Weight Log', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto('/weight')
  })

  test('displays weight log page with header and add button', async ({ authedPage: page }) => {
    await expect(page.locator('h2:has-text("Weight Log")')).toBeVisible()
    await expect(page.locator('button:has-text("Add Entry")')).toBeVisible()
  })

  test('shows data table when entries exist (demo account)', async ({ authedPage: page }) => {
    // Demo account should have seeded data
    await expect(page.locator('table')).toBeVisible()
    // Should have Date, Weight, Notes, Actions columns
    await expect(page.locator('th:has-text("Date")')).toBeVisible()
    await expect(page.locator('th:has-text("Weight")')).toBeVisible()
    await expect(page.locator('th:has-text("Notes")')).toBeVisible()
    await expect(page.locator('th:has-text("Actions")')).toBeVisible()
  })

  test('opens form when Add Entry is clicked', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Entry")')
    // Form should be visible with all fields
    await expect(page.locator('label:has-text("Date & Time")')).toBeVisible()
    await expect(page.locator('label:has-text("Weight")')).toBeVisible()
    await expect(page.locator('label:has-text("Unit")')).toBeVisible()
    await expect(page.locator('label:has-text("Notes")')).toBeVisible()
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible()
    await expect(page.locator('button:has-text("Save")')).toBeVisible()
  })

  test('can cancel form without saving', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Entry")')
    await expect(page.locator('label:has-text("Weight")')).toBeVisible()
    await page.click('button:has-text("Cancel")')
    // Form should be hidden
    await expect(page.locator('label:has-text("Weight")')).not.toBeVisible()
  })

  test('validates required fields', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Entry")')
    // Clear datetime field and blur
    await page.fill('input#datetime', '')
    await page.locator('input#weight').focus()
    await expect(page.locator('text=Date & time is required')).toBeVisible()

    // Leave weight empty and blur
    await page.locator('textarea#notes').focus()
    await expect(page.locator('text=Weight is required')).toBeVisible()
  })

  test('validates weight range', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Entry")')

    // Enter invalid weight (too high)
    await page.fill('input#weight', '1500')
    await page.locator('textarea#notes').focus()
    await expect(page.locator('text=Please enter a realistic weight')).toBeVisible()

    // Enter zero
    await page.fill('input#weight', '0')
    await page.locator('textarea#notes').focus()
    await expect(page.locator('text=Must be greater than 0')).toBeVisible()
  })

  test('can create a new weight log entry', async ({ authedPage: page }) => {
    const testWeight = '111.1'
    const testNotes = `E2E weight ${Date.now()}`

    await page.click('button:has-text("Add Entry")')

    // Fill form - datetime should be pre-filled with current time
    await page.fill('input#weight', testWeight)
    await page.fill('textarea#notes', testNotes)

    // Save
    await page.click('button:has-text("Save")')

    // Form should close and new entry should appear in table
    await expect(page.locator('label:has-text("Weight")')).not.toBeVisible({ timeout: 5000 })
    // Find row by unique notes
    const row = page.locator('table tbody tr', { has: page.locator(`text=${testNotes}`) })
    await expect(row).toBeVisible({ timeout: 5000 })
  })

  test('can edit an existing entry', async ({ authedPage: page }) => {
    // First create an entry to edit
    const originalNote = `Original ${Date.now()}`
    await page.click('button:has-text("Add Entry")')
    await page.fill('input#weight', '222.2')
    await page.fill('textarea#notes', originalNote)
    await page.click('button:has-text("Save")')
    await expect(page.locator(`text=${originalNote}`).first()).toBeVisible({ timeout: 5000 })

    // Find the row and open dropdown
    const row = page.locator('table tbody tr', { has: page.locator(`text=${originalNote}`) })
    await row.locator('button').click()
    await page.click('[role="menuitem"]:has-text("Edit")')

    // Edit form should open with pre-filled data
    await expect(page.locator('button:has-text("Update")')).toBeVisible()

    // Update the notes
    const updatedNotes = `Updated ${Date.now()}`
    await page.fill('textarea#notes', updatedNotes)
    await page.click('button:has-text("Update")')

    // Should see updated notes
    await expect(page.locator(`text=${updatedNotes}`).first()).toBeVisible({ timeout: 5000 })
  })

  test('can delete an entry with confirmation', async ({ authedPage: page }) => {
    // First create an entry to delete so we don't affect other tests
    const uniqueNote = `Delete test ${Date.now()}`
    await page.click('button:has-text("Add Entry")')
    await page.fill('input#weight', '888.8')
    await page.fill('textarea#notes', uniqueNote)
    await page.click('button:has-text("Save")')
    await expect(page.locator(`td:has-text("${uniqueNote}")`)).toBeVisible({ timeout: 5000 })

    // Find the row with our entry and delete it
    const row = page.locator('table tbody tr', { has: page.locator(`text=${uniqueNote}`) })
    await row.locator('button').click()

    // Set up dialog handler before clicking delete
    await page.evaluate(() => {
      window.confirm = () => true
    })
    await page.click('[role="menuitem"]:has-text("Delete")')

    // Entry should be gone
    await expect(page.locator(`td:has-text("${uniqueNote}")`)).not.toBeVisible({ timeout: 10000 })
  })

  test('can sort by date column', async ({ authedPage: page }) => {
    // Click on Date header to sort
    await page.click('th:has-text("Date")')
    // Should show sort indicator (arrow)
    await expect(page.locator('th:has-text("Date") svg')).toBeVisible()
  })

  test('can sort by weight column', async ({ authedPage: page }) => {
    await page.click('th:has-text("Weight")')
    await expect(page.locator('th:has-text("Weight") svg')).toBeVisible()
  })

  test('unit selector changes between lbs and kg', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Entry")')
    const unitSelect = page.locator('select#unit')

    // Default is lbs
    await expect(unitSelect).toHaveValue('lbs')

    // Change to kg
    await unitSelect.selectOption('kg')
    await expect(unitSelect).toHaveValue('kg')
  })
})
