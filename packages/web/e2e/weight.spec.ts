import { test, expect } from './fixtures/auth.js'

// Helper to delete weight entry
async function deleteWeightEntry(page: import('@playwright/test').Page, identifier: string) {
  const row = page.locator('table tbody tr', { has: page.locator(`text=${identifier}`) })
  await row.locator('button').click()
  await page.evaluate(() => {
    window.confirm = () => true
  })
  await page.click('[role="menuitem"]:has-text("Delete")')
  await expect(page.locator(`td:has-text("${identifier}")`)).not.toBeVisible({ timeout: 5000 })
}

test.describe('Weight Log', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto('/weight')
  })

  test('displays weight log page with header and add button', async ({ authedPage: page }) => {
    await expect(page.locator('h2:has-text("Weight Log")')).toBeVisible()
    await expect(page.locator('button:has-text("Add Entry")')).toBeVisible()
  })

  test('shows data table with correct columns', async ({ authedPage: page }) => {
    // Create entry to ensure table exists
    const testNotes = `Table test ${Date.now()}`
    await page.click('button:has-text("Add Entry")')
    await page.fill('input#weight', '150')
    await page.fill('textarea#notes', testNotes)
    await page.click('button:has-text("Save")')
    await expect(page.locator(`td:has-text("${testNotes}")`)).toBeVisible()

    // Verify table columns
    await expect(page.locator('table')).toBeVisible()
    await expect(page.locator('th:has-text("Date")')).toBeVisible()
    await expect(page.locator('th:has-text("Weight")')).toBeVisible()
    await expect(page.locator('th:has-text("Notes")')).toBeVisible()
    await expect(page.locator('th:has-text("Actions")')).toBeVisible()

    // Cleanup
    await deleteWeightEntry(page, testNotes)
  })

  test('opens form when Add Entry is clicked', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Entry")')
    await expect(page.locator('label:has-text("Date & Time")')).toBeVisible()
    await expect(page.locator('label:has-text("Weight")')).toBeVisible()
    await expect(page.locator('label:has-text("Notes")')).toBeVisible()
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible()
    await expect(page.locator('button:has-text("Save")')).toBeVisible()
  })

  test('can cancel form without saving', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Entry")')
    await expect(page.locator('label:has-text("Weight")')).toBeVisible()
    await page.click('button:has-text("Cancel")')
    await expect(page.locator('label:has-text("Weight")')).not.toBeVisible()
  })

  test('validates required fields', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Entry")')
    await page.fill('input#datetime', '')
    await page.locator('input#weight').focus()
    await expect(page.locator('text=Date & time is required')).toBeVisible()
    await page.locator('textarea#notes').focus()
    await expect(page.locator('text=Weight is required')).toBeVisible()
  })

  test('validates weight range', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Entry")')
    await page.fill('input#weight', '1500')
    await page.locator('textarea#notes').focus()
    await expect(page.locator('text=Please enter a realistic weight')).toBeVisible()
    await page.fill('input#weight', '0')
    await page.locator('textarea#notes').focus()
    await expect(page.locator('text=Must be greater than 0')).toBeVisible()
  })

  test('can create and delete weight log entry', async ({ authedPage: page }) => {
    const testNotes = `E2E weight ${Date.now()}`

    // Create
    await page.click('button:has-text("Add Entry")')
    await page.fill('input#weight', '111.1')
    await page.fill('textarea#notes', testNotes)
    await page.click('button:has-text("Save")')
    await expect(page.locator('label:has-text("Weight")')).not.toBeVisible({ timeout: 5000 })
    await expect(page.locator(`td:has-text("${testNotes}")`)).toBeVisible({ timeout: 5000 })

    // Cleanup
    await deleteWeightEntry(page, testNotes)
  })

  test('can edit and delete weight entry', async ({ authedPage: page }) => {
    const originalNote = `Original ${Date.now()}`
    const updatedNote = `Updated ${Date.now()}`

    // Create
    await page.click('button:has-text("Add Entry")')
    await page.fill('input#weight', '222.2')
    await page.fill('textarea#notes', originalNote)
    await page.click('button:has-text("Save")')
    await expect(page.locator(`text=${originalNote}`).first()).toBeVisible({ timeout: 5000 })

    // Edit
    const row = page.locator('table tbody tr', { has: page.locator(`text=${originalNote}`) })
    await row.locator('button').click()
    await page.click('[role="menuitem"]:has-text("Edit")')
    await expect(page.locator('button:has-text("Update")')).toBeVisible()
    await page.fill('textarea#notes', updatedNote)
    await page.click('button:has-text("Update")')
    await expect(page.locator(`text=${updatedNote}`).first()).toBeVisible({ timeout: 5000 })

    // Cleanup
    await deleteWeightEntry(page, updatedNote)
  })

  test('can sort by date column', async ({ authedPage: page }) => {
    // Create entry to ensure table exists
    const testNotes = `Sort test ${Date.now()}`
    await page.click('button:has-text("Add Entry")')
    await page.fill('input#weight', '150')
    await page.fill('textarea#notes', testNotes)
    await page.click('button:has-text("Save")')
    await expect(page.locator(`td:has-text("${testNotes}")`)).toBeVisible()

    // Test sort
    await page.click('th:has-text("Date")')
    await expect(page.locator('th:has-text("Date") svg')).toBeVisible()

    // Cleanup
    await deleteWeightEntry(page, testNotes)
  })

  test('can sort by weight column', async ({ authedPage: page }) => {
    // Create entry to ensure table exists
    const testNotes = `Sort test ${Date.now()}`
    await page.click('button:has-text("Add Entry")')
    await page.fill('input#weight', '150')
    await page.fill('textarea#notes', testNotes)
    await page.click('button:has-text("Save")')
    await expect(page.locator(`td:has-text("${testNotes}")`)).toBeVisible()

    // Test sort
    await page.click('th:has-text("Weight")')
    await expect(page.locator('th:has-text("Weight") svg')).toBeVisible()

    // Cleanup
    await deleteWeightEntry(page, testNotes)
  })
})
