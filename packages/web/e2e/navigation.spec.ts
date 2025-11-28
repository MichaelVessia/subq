import { test as base, expect } from '@playwright/test'
import { DEMO_USER, loginAsDemoUser } from './fixtures/auth.js'

// Navigation tests use demo user (read-only)
const test = base.extend<{ demoPage: import('@playwright/test').Page }>({
  demoPage: async ({ page }, use) => {
    await loginAsDemoUser(page)
    await use(page)
  },
})

test.describe('Navigation', () => {
  test('redirects / to /stats', async ({ demoPage: page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/stats')
  })

  test('shows all nav links', async ({ demoPage: page }) => {
    await expect(page.locator('nav a:has-text("Stats")')).toBeVisible()
    await expect(page.locator('nav a:has-text("Weight")')).toBeVisible()
    await expect(page.locator('nav a:has-text("Injections")')).toBeVisible()
    await expect(page.locator('nav a:has-text("Inventory")')).toBeVisible()
    await expect(page.locator('nav a:has-text("Schedule")')).toBeVisible()
  })

  test('highlights active nav link', async ({ demoPage: page }) => {
    await page.goto('/stats')
    await expect(page.locator('nav a:has-text("Stats")')).toHaveClass(/border-foreground/)
    await page.click('nav a:has-text("Weight")')
    await expect(page).toHaveURL('/weight')
    await expect(page.locator('nav a:has-text("Weight")')).toHaveClass(/border-foreground/)
  })

  test('navigates to all pages via nav links', async ({ demoPage: page }) => {
    await page.click('nav a:has-text("Stats")')
    await expect(page).toHaveURL('/stats')
    await page.click('nav a:has-text("Weight")')
    await expect(page).toHaveURL('/weight')
    await expect(page.locator('h2:has-text("Weight Log")')).toBeVisible()
    await page.click('nav a:has-text("Injections")')
    await expect(page).toHaveURL('/injection')
    await expect(page.locator('h2:has-text("Injection Log")')).toBeVisible()
    await page.click('nav a:has-text("Inventory")')
    await expect(page).toHaveURL('/inventory')
    await expect(page.locator('h2:has-text("GLP-1 Inventory")')).toBeVisible()
    await page.click('nav a:has-text("Schedule")')
    await expect(page).toHaveURL('/schedule')
    await expect(page.locator('h2:has-text("Injection Schedule")')).toBeVisible()
  })

  test('shows user email in header', async ({ demoPage: page }) => {
    await expect(page.locator(`text=${DEMO_USER.email}`)).toBeVisible()
  })

  test('shows SubQ branding', async ({ demoPage: page }) => {
    await expect(page.locator('h1:has-text("SubQ")')).toBeVisible()
  })
})
