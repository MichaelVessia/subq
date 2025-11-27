import { test, expect } from './fixtures/auth.js'

test.describe('Navigation', () => {
  test('redirects / to /stats', async ({ authedPage: page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/stats')
  })

  test('shows all nav links', async ({ authedPage: page }) => {
    await expect(page.locator('nav a:has-text("Stats")')).toBeVisible()
    await expect(page.locator('nav a:has-text("Weight")')).toBeVisible()
    await expect(page.locator('nav a:has-text("Injections")')).toBeVisible()
    await expect(page.locator('nav a:has-text("Inventory")')).toBeVisible()
    await expect(page.locator('nav a:has-text("Schedule")')).toBeVisible()
  })

  test('highlights active nav link', async ({ authedPage: page }) => {
    // On stats page, Stats should be active
    await page.goto('/stats')
    await expect(page.locator('nav a:has-text("Stats")')).toHaveClass(/border-foreground/)

    // Navigate to weight, Weight should be active
    await page.click('nav a:has-text("Weight")')
    await expect(page).toHaveURL('/weight')
    await expect(page.locator('nav a:has-text("Weight")')).toHaveClass(/border-foreground/)
  })

  test('navigates to all pages via nav links', async ({ authedPage: page }) => {
    // Stats
    await page.click('nav a:has-text("Stats")')
    await expect(page).toHaveURL('/stats')

    // Weight
    await page.click('nav a:has-text("Weight")')
    await expect(page).toHaveURL('/weight')
    await expect(page.locator('h2:has-text("Weight Log")')).toBeVisible()

    // Injections
    await page.click('nav a:has-text("Injections")')
    await expect(page).toHaveURL('/injection')
    await expect(page.locator('h2:has-text("Injection Log")')).toBeVisible()

    // Inventory
    await page.click('nav a:has-text("Inventory")')
    await expect(page).toHaveURL('/inventory')
    await expect(page.locator('h2:has-text("GLP-1 Inventory")')).toBeVisible()

    // Schedule
    await page.click('nav a:has-text("Schedule")')
    await expect(page).toHaveURL('/schedule')
    await expect(page.locator('h2:has-text("Injection Schedule")')).toBeVisible()
  })

  test('shows user email in header', async ({ authedPage: page }) => {
    await expect(page.locator('text=consistent@example.com')).toBeVisible()
  })

  test('shows SubQ branding', async ({ authedPage: page }) => {
    await expect(page.locator('h1:has-text("SubQ")')).toBeVisible()
  })
})
