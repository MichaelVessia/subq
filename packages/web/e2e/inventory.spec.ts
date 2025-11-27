import { test, expect } from './fixtures/auth.js'

test.describe('Inventory', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto('/inventory')
  })

  test('displays inventory page with header and add button', async ({ authedPage: page }) => {
    await expect(page.locator('h2:has-text("Inventory")')).toBeVisible()
    await expect(page.locator('button:has-text("Add Item")')).toBeVisible()
  })

  test('opens form when Add Item is clicked', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Item")')
    await expect(page.locator('label:has-text("Form")')).toBeVisible()
    await expect(page.locator('label:has-text("Medication")')).toBeVisible()
    await expect(page.locator('label:has-text("Pharmacy")')).toBeVisible()
    await expect(page.locator('label:has-text("Total Amount")')).toBeVisible()
    await expect(page.locator('label:has-text("Status")')).toBeVisible()
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible()
  })

  test('can cancel form without saving', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Item")')
    await expect(page.locator('label:has-text("Medication")')).toBeVisible()
    await page.click('button:has-text("Cancel")')
    await expect(page.locator('label:has-text("Medication")')).not.toBeVisible()
  })

  test('form type selector shows vial by default', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Item")')
    const formSelect = page.locator('select#form')
    await expect(formSelect).toHaveValue('vial')
  })

  test('vial form shows compounded medications', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Item")')
    // Can select a compounded medication
    await page.selectOption('select#drug', { label: 'Semaglutide (Compounded)' })
    await expect(page.locator('select#drug')).toHaveValue('Semaglutide (Compounded)')
  })

  test('pen form shows branded medications', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Item")')

    // Switch to pen form
    await page.selectOption('select#form', 'pen')

    // Can select a branded medication
    await page.selectOption('select#drug', { label: 'Semaglutide (Ozempic)' })
    await expect(page.locator('select#drug')).toHaveValue('Semaglutide (Ozempic)')
  })

  test('shows beyond use date field only for vials', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Item")')

    // Vial form shows BUD
    await expect(page.locator('label:has-text("Beyond Use Date")')).toBeVisible()

    // Switch to pen form
    await page.selectOption('select#form', 'pen')

    // BUD should be hidden for pens
    await expect(page.locator('label:has-text("Beyond Use Date")')).not.toBeVisible()
  })

  test('can create a new inventory item', async ({ authedPage: page }) => {
    const uniquePharmacy = `Pharmacy ${Date.now()}`
    await page.click('button:has-text("Add Item")')

    // Fill form
    await page.selectOption('select#drug', { label: 'Semaglutide (Compounded)' })
    await page.fill('input#source', uniquePharmacy)
    await page.fill('input#totalAmount', '10mg')

    // Save - use exact match to avoid ambiguity with "Add Item"
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    // Form should close and new item should appear
    await expect(page.locator('label:has-text("Medication")')).not.toBeVisible({ timeout: 5000 })
    // Find card by unique pharmacy name
    await expect(page.locator(`text=${uniquePharmacy}`)).toBeVisible({ timeout: 5000 })
  })

  test('shows status badges on inventory cards', async ({ authedPage: page }) => {
    // Demo account should have inventory items with status badges
    const statusBadge = page.locator('.rounded-full:has-text("new"), .rounded-full:has-text("opened")')
    // Should have at least one status badge visible
    await expect(statusBadge.first()).toBeVisible({ timeout: 5000 })
  })

  test('can edit an inventory item', async ({ authedPage: page }) => {
    // First create an item to edit
    const originalPharmacy = `Edit Original ${Date.now()}`
    await page.click('button:has-text("Add Item")')
    await page.selectOption('select#drug', { label: 'Tirzepatide (Compounded)' })
    await page.fill('input#source', originalPharmacy)
    await page.fill('input#totalAmount', '15mg')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator(`text=${originalPharmacy}`)).toBeVisible({ timeout: 5000 })

    // Find the card and open dropdown
    const card = page.locator(`.grid > div:has-text("${originalPharmacy}")`)
    await card.locator('button').click()
    await page.click('[role="menuitem"]:has-text("Edit")')

    // Edit form should open
    await expect(page.locator('button:has-text("Update")')).toBeVisible()

    // Update pharmacy
    const updatedPharmacy = `Edit Updated ${Date.now()}`
    await page.fill('input#source', updatedPharmacy)
    await page.click('button:has-text("Update")')

    // Should see updated pharmacy
    await expect(page.locator(`text=${updatedPharmacy}`)).toBeVisible({ timeout: 5000 })
  })

  test('can mark item as opened', async ({ authedPage: page }) => {
    // First create a new item to ensure it has "new" status
    const uniquePharmacy = `Mark Opened ${Date.now()}`
    await page.click('button:has-text("Add Item")')
    await page.selectOption('select#drug', { label: 'Tirzepatide (Compounded)' })
    await page.fill('input#source', uniquePharmacy)
    await page.fill('input#totalAmount', '5mg')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator(`text=${uniquePharmacy}`)).toBeVisible({ timeout: 5000 })

    // Find the card and open dropdown
    const card = page.locator(`.grid > div:has-text("${uniquePharmacy}")`)
    await card.locator('button').click()

    // Click Mark Opened
    await page.click('[role="menuitem"]:has-text("Mark Opened")')

    // Should now show opened status
    await expect(card.locator('text=opened')).toBeVisible({ timeout: 5000 })
  })

  test('can mark item as finished', async ({ authedPage: page }) => {
    // Find a non-finished card
    const card = page.locator('.grid > div').first()
    await card.locator('button').click()

    // Click Mark Finished
    await page.click('[role="menuitem"]:has-text("Mark Finished")')

    // Should see "Finished" section
    await expect(page.locator('h3:has-text("Finished")')).toBeVisible({ timeout: 5000 })
  })

  test('can delete an inventory item', async ({ authedPage: page }) => {
    // Create an item to delete
    await page.click('button:has-text("Add Item")')
    await page.selectOption('select#drug', { label: 'Retatrutide (Compounded)' })
    await page.fill('input#source', 'Delete Test Pharmacy')
    await page.fill('input#totalAmount', '8mg')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator('label:has-text("Medication")')).not.toBeVisible({ timeout: 5000 })

    // Find the card and open dropdown
    const card = page.locator('.grid > div:has-text("Delete Test Pharmacy")')
    await card.locator('button').click()

    // Delete with confirmation
    page.once('dialog', (dialog) => dialog.accept())
    await page.click('[role="menuitem"]:has-text("Delete")')

    // Item should be gone
    await expect(page.locator('text=Delete Test Pharmacy')).not.toBeVisible({ timeout: 5000 })
  })

  test('shows finished items in separate section', async ({ authedPage: page }) => {
    // If there are finished items, they should be in a separate section
    const finishedSection = page.locator('h3:has-text("Finished")')
    if (await finishedSection.isVisible()) {
      // Finished section should have lower opacity
      await expect(page.locator('.opacity-60')).toBeVisible()
    }
  })

  test('status selector has all options', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Item")')
    const statusSelect = page.locator('select#status')
    // Verify we can select each status
    await statusSelect.selectOption('new')
    await expect(statusSelect).toHaveValue('new')
    await statusSelect.selectOption('opened')
    await expect(statusSelect).toHaveValue('opened')
    await statusSelect.selectOption('finished')
    await expect(statusSelect).toHaveValue('finished')
  })
})
