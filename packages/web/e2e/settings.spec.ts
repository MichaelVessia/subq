import { test, expect } from './fixtures/auth.js'

test.describe('Settings', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto('/settings')
    await expect(page.locator('h2:has-text("Settings")')).toBeVisible({ timeout: 10000 })
  })

  test('navigates to settings via gear icon', async ({ authedPage: page }) => {
    await page.goto('/stats')
    await page.click('button[title="Settings"]')
    await expect(page).toHaveURL('/settings')
    await expect(page.locator('h2:has-text("Settings")')).toBeVisible()
  })

  test('displays settings page with display preferences', async ({ authedPage: page }) => {
    await expect(page.locator('text=Display Preferences')).toBeVisible()
    await expect(page.locator('text=Weight Unit')).toBeVisible()
    await expect(page.locator('text=Choose how weights are displayed throughout the app')).toBeVisible()
  })

  test('shows weight unit toggle buttons', async ({ authedPage: page }) => {
    await expect(page.locator('button:has-text("Pounds (lbs)")')).toBeVisible()
    await expect(page.locator('button:has-text("Kilograms (kg)")')).toBeVisible()
  })

  test('can change weight unit to kg', async ({ authedPage: page }) => {
    // Click kg button
    await page.click('button:has-text("Kilograms (kg)")')

    // kg button should now be active (has bg-primary) - wait for RPC to complete
    const kgButton = page.locator('button:has-text("Kilograms (kg)")')
    await expect(kgButton).toHaveClass(/bg-primary/, { timeout: 5000 })

    // lbs button should now be outline (no bg-primary)
    const lbsButton = page.locator('button:has-text("Pounds (lbs)")')
    await expect(lbsButton).not.toHaveClass(/bg-primary/)
  })

  test('can change weight unit to lbs', async ({ authedPage: page }) => {
    // First set to kg
    await page.click('button:has-text("Kilograms (kg)")')
    await expect(page.locator('button:has-text("Kilograms (kg)")')).toHaveClass(/bg-primary/, { timeout: 5000 })

    // Then switch back to lbs
    await page.click('button:has-text("Pounds (lbs)")')

    // lbs should now be active - wait for RPC to complete
    const lbsButton = page.locator('button:has-text("Pounds (lbs)")')
    await expect(lbsButton).toHaveClass(/bg-primary/, { timeout: 5000 })

    // kg should now be outline
    const kgButton = page.locator('button:has-text("Kilograms (kg)")')
    await expect(kgButton).not.toHaveClass(/bg-primary/)
  })

  test('weight unit persists after navigation', async ({ authedPage: page }) => {
    // Set to kg
    await page.click('button:has-text("Kilograms (kg)")')
    await expect(page.locator('button:has-text("Kilograms (kg)")')).toHaveClass(/bg-primary/, { timeout: 5000 })

    // Navigate away
    await page.click('nav a:has-text("Stats")')
    await expect(page).toHaveURL('/stats')

    // Navigate back to settings
    await page.click('button[title="Settings"]')
    await expect(page).toHaveURL('/settings')

    // kg should still be selected
    const kgButton = page.locator('button:has-text("Kilograms (kg)")')
    await expect(kgButton).toHaveClass(/bg-primary/, { timeout: 5000 })

    // Reset to lbs for other tests
    await page.click('button:has-text("Pounds (lbs)")')
    await expect(page.locator('button:has-text("Pounds (lbs)")')).toHaveClass(/bg-primary/, { timeout: 5000 })
  })

  test('displays change password form', async ({ authedPage: page }) => {
    await expect(page.getByRole('heading', { name: 'Change Password' })).toBeVisible()
    await expect(page.getByText('Current Password', { exact: true })).toBeVisible()
    await expect(page.getByText('New Password', { exact: true })).toBeVisible()
    await expect(page.getByText('Confirm New Password', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change Password' })).toBeVisible()
  })

  test('shows error when passwords do not match', async ({ authedPage: page }) => {
    await page.fill('input#currentPassword', 'currentpass')
    await page.fill('input#newPassword', 'newpassword123')
    await page.fill('input#confirmPassword', 'differentpassword')
    await page.click('button:has-text("Change Password")')
    await expect(page.locator('text=New passwords do not match')).toBeVisible()
  })

  test('shows error when new password is too short', async ({ authedPage: page }) => {
    await page.fill('input#currentPassword', 'currentpass')
    await page.fill('input#newPassword', 'short')
    await page.fill('input#confirmPassword', 'short')
    await page.click('button:has-text("Change Password")')
    await expect(page.locator('text=New password must be at least 8 characters')).toBeVisible()
  })
})
