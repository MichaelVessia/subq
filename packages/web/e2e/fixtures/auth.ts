import { test as base, expect, type Page } from '@playwright/test'

// E2E test user - dedicated account for CI e2e tests (no seeded data)
// Must be created manually in prod before running CI tests
export const E2E_USER = {
  email: 'e2e@test.subq.vessia.net',
  password: 'testpassword123',
}

// Demo user credentials (seeded in prod with sample data)
export const DEMO_USER = {
  email: 'consistent@example.com',
  password: 'testpassword123',
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/stats')
  await page.waitForSelector('text=Sign In')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await expect(page.locator('text=Sign Out')).toBeVisible({ timeout: 10000 })
}

// Try login, sign up if user doesn't exist (for fresh preview envs)
export async function loginOrSignUp(page: Page, email: string, password: string, name: string) {
  await page.goto('/stats')
  await page.waitForSelector('text=Sign In')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')

  // Check if login succeeded or failed
  const signOut = page.locator('text=Sign Out')
  const error = page.locator('text=Invalid email or password')

  const result = await Promise.race([
    signOut.waitFor({ timeout: 5000 }).then(() => 'success'),
    error.waitFor({ timeout: 5000 }).then(() => 'failed'),
  ]).catch(() => 'timeout')

  if (result === 'success') return

  // Login failed - sign up instead
  await page.click('text=Sign up')
  await page.fill('input[placeholder="Name"]', name)
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await expect(page.locator('text=Sign Out')).toBeVisible({ timeout: 10000 })
}

export async function loginAsE2EUser(page: Page) {
  await loginOrSignUp(page, E2E_USER.email, E2E_USER.password, 'E2E Test User')
}

export async function loginAsDemoUser(page: Page) {
  await login(page, DEMO_USER.email, DEMO_USER.password)
}

export async function logout(page: Page) {
  await page.click('button:has-text("Sign Out")')
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
// Uses E2E user for CRUD tests (cleans up after itself)
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await loginAsE2EUser(page)
    await use(page)
  },
})

export { expect } from '@playwright/test'
