import { test, expect } from '@playwright/test'
import { DEMO_USER, login, loginWithDemo, logout } from './fixtures/auth.js'

test.describe('Authentication', () => {
  test('shows login form when not authenticated', async ({ page }) => {
    await page.goto('/stats')
    await expect(page.locator('h1:has-text("Sign In")')).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]:has-text("Sign In")')).toBeVisible()
  })

  test('can login with demo account button', async ({ page }) => {
    await loginWithDemo(page)
    await expect(page.locator('text=Sign Out')).toBeVisible()
    await expect(page.locator(`text=${DEMO_USER.email}`)).toBeVisible()
  })

  test('can login with email and password', async ({ page }) => {
    await login(page, DEMO_USER.email, DEMO_USER.password)
    await expect(page.locator('text=Sign Out')).toBeVisible()
  })

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForSelector('text=Sign In')
    await page.fill('input[type="email"]', 'invalid@example.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')
    // Should show error message and stay on login page
    await expect(page.locator('.text-destructive')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('h1:has-text("Sign In")')).toBeVisible()
  })

  test('can toggle between sign in and sign up modes', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForSelector('text=Sign In')

    // Initially in sign in mode
    await expect(page.locator('h1:has-text("Sign In")')).toBeVisible()
    await expect(page.locator('input[placeholder="Name"]')).not.toBeVisible()

    // Switch to sign up mode
    await page.click('text=Sign up')
    await expect(page.locator('h1:has-text("Create Account")')).toBeVisible()
    await expect(page.locator('input[placeholder="Name"]')).toBeVisible()

    // Switch back to sign in
    await page.click('text=Sign in')
    await expect(page.locator('h1:has-text("Sign In")')).toBeVisible()
    await expect(page.locator('input[placeholder="Name"]')).not.toBeVisible()
  })

  test('can sign out', async ({ page }) => {
    await loginWithDemo(page)
    await logout(page)
    await expect(page.locator('h1:has-text("Sign In")')).toBeVisible()
  })

  test('session persists after page refresh', async ({ page }) => {
    await loginWithDemo(page)
    await page.reload()
    // Should still be logged in after refresh
    await expect(page.locator('text=Sign Out')).toBeVisible({ timeout: 10000 })
  })
})
