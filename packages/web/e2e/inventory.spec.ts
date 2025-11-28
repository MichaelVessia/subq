import { test, expect } from './fixtures/auth.js'

// Helper to delete inventory item
async function deleteInventoryItem(page: import('@playwright/test').Page, identifier: string) {
  const card = page.locator(`.grid > div:has-text("${identifier}")`)
  await card.locator('button').click()
  // Wait for menu to appear
  await expect(page.locator('[role="menuitem"]:has-text("Delete")')).toBeVisible()
  await page.evaluate(() => {
    window.confirm = () => true
  })
  await page.click('[role="menuitem"]:has-text("Delete")')
  await expect(page.locator(`text=${identifier}`)).not.toBeVisible()
}

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
    await page.selectOption('select#drug', { label: 'Semaglutide (Compounded)' })
    await expect(page.locator('select#drug')).toHaveValue('Semaglutide (Compounded)')
  })

  test('pen form shows branded medications', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Item")')
    await page.selectOption('select#form', 'pen')
    await page.selectOption('select#drug', { label: 'Semaglutide (Ozempic)' })
    await expect(page.locator('select#drug')).toHaveValue('Semaglutide (Ozempic)')
  })

  test('shows beyond use date field only for vials', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Item")')
    await expect(page.locator('label:has-text("Beyond Use Date")')).toBeVisible()
    await page.selectOption('select#form', 'pen')
    await expect(page.locator('label:has-text("Beyond Use Date")')).not.toBeVisible()
  })

  test('can create and delete inventory item', async ({ authedPage: page }) => {
    const uniquePharmacy = `Pharmacy ${Date.now()}`

    // Create
    await page.click('button:has-text("Add Item")')
    await page.selectOption('select#drug', { label: 'Semaglutide (Compounded)' })
    await page.fill('input#source', uniquePharmacy)
    await page.fill('input#totalAmount', '10mg')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator('label:has-text("Medication")')).not.toBeVisible({ timeout: 5000 })
    await expect(page.locator(`text=${uniquePharmacy}`)).toBeVisible({ timeout: 5000 })

    // Cleanup
    await deleteInventoryItem(page, uniquePharmacy)
  })

  test('can edit and delete inventory item', async ({ authedPage: page }) => {
    const originalPharmacy = `Edit Original ${Date.now()}`
    const updatedPharmacy = `Edit Updated ${Date.now()}`

    // Create
    await page.click('button:has-text("Add Item")')
    await page.selectOption('select#drug', { label: 'Tirzepatide (Compounded)' })
    await page.fill('input#source', originalPharmacy)
    await page.fill('input#totalAmount', '15mg')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator(`text=${originalPharmacy}`)).toBeVisible({ timeout: 5000 })

    // Edit
    const card = page.locator(`.grid > div:has-text("${originalPharmacy}")`)
    await card.locator('button').click()
    await page.click('[role="menuitem"]:has-text("Edit")')
    await expect(page.locator('button:has-text("Update")')).toBeVisible()
    await page.fill('input#source', updatedPharmacy)
    await page.click('button:has-text("Update")')
    await expect(page.locator(`text=${updatedPharmacy}`)).toBeVisible({ timeout: 5000 })

    // Cleanup
    await deleteInventoryItem(page, updatedPharmacy)
  })

  test('can mark item as opened and delete', async ({ authedPage: page }) => {
    const uniquePharmacy = `Mark Opened ${Date.now()}`

    // Create
    await page.click('button:has-text("Add Item")')
    await page.selectOption('select#drug', { label: 'Tirzepatide (Compounded)' })
    await page.fill('input#source', uniquePharmacy)
    await page.fill('input#totalAmount', '5mg')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator(`text=${uniquePharmacy}`)).toBeVisible({ timeout: 5000 })

    // Mark opened
    const card = page.locator(`.grid > div:has-text("${uniquePharmacy}")`)
    await card.locator('button').click()
    await page.click('[role="menuitem"]:has-text("Mark Opened")')
    await expect(card.locator('text=opened')).toBeVisible({ timeout: 5000 })

    // Cleanup
    await deleteInventoryItem(page, uniquePharmacy)
  })

  test('can mark item as finished and delete', async ({ authedPage: page }) => {
    const uniquePharmacy = `Mark Finished ${Date.now()}`

    // Create
    await page.click('button:has-text("Add Item")')
    await page.selectOption('select#drug', { label: 'Retatrutide (Compounded)' })
    await page.fill('input#source', uniquePharmacy)
    await page.fill('input#totalAmount', '8mg')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.locator(`text=${uniquePharmacy}`)).toBeVisible({ timeout: 5000 })

    // Mark finished
    const card = page.locator(`.grid > div:has-text("${uniquePharmacy}")`)
    await card.locator('button').click()
    await page.click('[role="menuitem"]:has-text("Mark Finished")')
    await expect(page.locator('h3:has-text("Finished")')).toBeVisible({ timeout: 5000 })

    // Cleanup - item is now in finished section
    await deleteInventoryItem(page, uniquePharmacy)
  })

  test('status selector has all options', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Item")')
    const statusSelect = page.locator('select#status')
    await statusSelect.selectOption('new')
    await expect(statusSelect).toHaveValue('new')
    await statusSelect.selectOption('opened')
    await expect(statusSelect).toHaveValue('opened')
    await statusSelect.selectOption('finished')
    await expect(statusSelect).toHaveValue('finished')
  })
})
