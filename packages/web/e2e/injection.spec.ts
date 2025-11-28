import { test, expect } from './fixtures/auth.js'

test.describe('Injection Log', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto('/injection')
  })

  test('displays injection log page with header and add button', async ({ authedPage: page }) => {
    await expect(page.locator('h2:has-text("Injection Log")')).toBeVisible()
    await expect(page.locator('button:has-text("Add Entry")')).toBeVisible()
  })

  test('shows data table with correct columns', async ({ authedPage: page }) => {
    await expect(page.locator('table')).toBeVisible()
    await expect(page.locator('th:has-text("Date")')).toBeVisible()
    await expect(page.locator('th:has-text("Drug")')).toBeVisible()
    await expect(page.locator('th:has-text("Dosage")')).toBeVisible()
    await expect(page.locator('th:has-text("Site")')).toBeVisible()
    await expect(page.locator('th:has-text("Schedule")')).toBeVisible()
    await expect(page.locator('th:has-text("Actions")')).toBeVisible()
  })

  test('opens form when Add Entry is clicked', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Entry")')
    await expect(page.locator('label:has-text("Date & Time")')).toBeVisible()
    await expect(page.locator('label:has-text("Medication")')).toBeVisible()
    await expect(page.locator('label:has-text("Dosage")')).toBeVisible()
    await expect(page.locator('label:has-text("Source")')).toBeVisible()
    await expect(page.locator('label:has-text("Injection Site")')).toBeVisible()
    await expect(page.locator('label:has-text("Notes")')).toBeVisible()
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible()
    await expect(page.locator('button:has-text("Save")')).toBeVisible()
  })

  test('can cancel form without saving', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Entry")')
    await expect(page.locator('label:has-text("Medication")')).toBeVisible()
    await page.click('button:has-text("Cancel")')
    await expect(page.locator('label:has-text("Medication")')).not.toBeVisible()
  })

  test('validates required fields', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Entry")')

    // Clear datetime and blur
    await page.fill('input#datetime', '')
    await page.locator('select#drug').focus()
    await expect(page.locator('text=Date & time is required')).toBeVisible()

    // Leave medication empty and blur
    await page.locator('input#dosage').focus()
    await expect(page.locator('text=Medication is required')).toBeVisible()

    // Leave dosage empty and blur
    await page.locator('textarea#notes').focus()
    await expect(page.locator('text=Dosage is required')).toBeVisible()
  })

  test('validates dosage format', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Entry")')

    // Enter invalid dosage format
    await page.fill('input#dosage', 'invalid')
    await page.locator('textarea#notes').focus()
    await expect(page.locator('text=Enter dosage with unit')).toBeVisible()

    // Enter valid dosage
    await page.fill('input#dosage', '2.5mg')
    await page.locator('textarea#notes').focus()
    await expect(page.locator('text=Enter dosage with unit')).not.toBeVisible()
  })

  test('shows medication options in dropdown', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Entry")')
    const select = page.locator('select#drug')

    // Should have GLP-1 drugs - verify by selecting
    await select.selectOption({ label: 'Semaglutide (Ozempic)' })
    await expect(select).toHaveValue('Semaglutide (Ozempic)')
  })

  test('shows injection site options', async ({ authedPage: page }) => {
    await page.click('button:has-text("Add Entry")')
    const select = page.locator('select#injectionSite')

    // Verify by selecting
    await select.selectOption({ label: 'Left abdomen' })
    await expect(select).toHaveValue('Left abdomen')
  })

  test('can create and delete injection log entry', async ({ authedPage: page }) => {
    const uniqueDosage = `0.${Date.now() % 1000}mg`

    // Create
    await page.click('button:has-text("Add Entry")')
    await page.selectOption('select#drug', { label: 'Semaglutide (Ozempic)' })
    await page.fill('input#dosage', uniqueDosage)
    await page.selectOption('select#injectionSite', { label: 'Left abdomen' })
    await page.click('button:has-text("Save")')
    await expect(page.locator('label:has-text("Medication")')).not.toBeVisible({ timeout: 5000 })
    await expect(page.locator(`table tbody td:has-text("${uniqueDosage}")`)).toBeVisible({ timeout: 5000 })

    // Cleanup: delete the entry
    const row = page.locator('table tbody tr', { has: page.locator(`td:has-text("${uniqueDosage}")`) })
    await row.locator('button:has(.sr-only)').click()
    await page.evaluate(() => {
      window.confirm = () => true
    })
    await page.click('[role="menuitem"]:has-text("Delete")')
    await expect(page.locator(`table tbody td:has-text("${uniqueDosage}")`)).not.toBeVisible({ timeout: 5000 })
  })

  test('can edit and delete an entry', async ({ authedPage: page }) => {
    const uniqueDosage = `0.${Date.now() % 1000}mg`

    // Create entry first
    await page.click('button:has-text("Add Entry")')
    await page.selectOption('select#drug', { label: 'Semaglutide (Ozempic)' })
    await page.fill('input#dosage', uniqueDosage)
    await page.click('button:has-text("Save")')
    await expect(page.locator(`table tbody td:has-text("${uniqueDosage}")`)).toBeVisible({ timeout: 5000 })

    // Edit
    const row = page.locator('table tbody tr', { has: page.locator(`td:has-text("${uniqueDosage}")`) })
    await row.locator('button:has(.sr-only)').click()
    await page.click('[role="menuitem"]:has-text("Edit")')
    await expect(page.locator('button:has-text("Update")')).toBeVisible()
    await page.fill('textarea#notes', 'Updated injection note')
    await page.click('button:has-text("Update")')
    await expect(page.locator('button:has-text("Update")')).not.toBeVisible({ timeout: 5000 })

    // Cleanup: delete
    await row.locator('button:has(.sr-only)').click()
    await page.evaluate(() => {
      window.confirm = () => true
    })
    await page.click('[role="menuitem"]:has-text("Delete")')
    await expect(page.locator(`table tbody td:has-text("${uniqueDosage}")`)).not.toBeVisible({ timeout: 5000 })
  })

  test('can select rows with checkboxes', async ({ authedPage: page }) => {
    const uniqueDosage = `0.${Date.now() % 1000}mg`

    // Create entry to test with
    await page.click('button:has-text("Add Entry")')
    await page.selectOption('select#drug', { label: 'Semaglutide (Ozempic)' })
    await page.fill('input#dosage', uniqueDosage)
    await page.click('button:has-text("Save")')
    await expect(page.locator(`table tbody td:has-text("${uniqueDosage}")`)).toBeVisible({ timeout: 5000 })

    // Test checkbox selection
    const row = page.locator('table tbody tr', { has: page.locator(`td:has-text("${uniqueDosage}")`) })
    const checkbox = row.locator('input[type="checkbox"]')
    await checkbox.check()
    await expect(checkbox).toBeChecked()
    await expect(page.locator('text=1 selected')).toBeVisible()

    // Clear selection
    await page.locator('.bg-muted\\/50 button:has(svg)').first().click()
    await expect(page.locator('text=1 selected')).not.toBeVisible()

    // Cleanup
    await row.locator('button:has(.sr-only)').click()
    await page.evaluate(() => {
      window.confirm = () => true
    })
    await page.click('[role="menuitem"]:has-text("Delete")')
    await expect(page.locator(`table tbody td:has-text("${uniqueDosage}")`)).not.toBeVisible({ timeout: 5000 })
  })

  test('can sort by date column', async ({ authedPage: page }) => {
    await page.click('th:has-text("Date")')
    await expect(page.locator('th:has-text("Date") svg')).toBeVisible()
  })
})
