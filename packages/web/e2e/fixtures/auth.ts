import { test as base, expect, type Page } from '@playwright/test'

// Demo user credentials (seeded in DB)
export const DEMO_USER = {
  email: 'consistent@example.com',
  password: 'testpassword123',
}

// Test user for CRUD operations (to avoid polluting demo data)
export const TEST_USER = {
  email: `test-${Date.now()}@example.com`,
  password: 'testpassword123',
  name: 'Test User',
}

export async function login(page: Page, email = DEMO_USER.email, password = DEMO_USER.password) {
  await page.goto('/stats')
  // Wait for login form
  await page.waitForSelector('text=Sign In')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  // Wait for navigation to complete (user is logged in)
  await expect(page.locator('text=Sign Out')).toBeVisible({ timeout: 10000 })
}

export async function loginWithDemo(page: Page) {
  await page.goto('/stats')
  await page.waitForSelector('text=Sign In')
  await page.click('button:has-text("Demo Account")')
  await expect(page.locator('text=Sign Out')).toBeVisible({ timeout: 10000 })
}

export async function logout(page: Page) {
  await page.click('button:has-text("Sign Out")')
  // After logout, page reloads to /stats which shows login form
  await expect(page.locator('h1:has-text("Sign In")')).toBeVisible({ timeout: 10000 })
}

export async function signUp(page: Page, email: string, password: string, name: string) {
  await page.goto('/stats')
  await page.waitForSelector('text=Sign In')
  await page.click('text=Sign up')
  await page.fill('input[placeholder="Name"]', name)
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await expect(page.locator('text=Sign Out')).toBeVisible({ timeout: 10000 })
}

// Extended test fixture with authenticated page
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await loginWithDemo(page)
    await use(page)
  },
})

export { expect } from '@playwright/test'
