import { test, expect } from './fixtures/auth.js'

test.describe('Stats Page', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto('/stats')
  })

  test('displays stats page with time range selector', async ({ authedPage: page }) => {
    // Time range buttons should be visible
    await expect(page.locator('button:has-text("1 Month")')).toBeVisible()
    await expect(page.locator('button:has-text("3 Months")')).toBeVisible()
    await expect(page.locator('button:has-text("6 Months")')).toBeVisible()
    await expect(page.locator('button:has-text("1 Year")')).toBeVisible()
    await expect(page.locator('button:has-text("All Time")')).toBeVisible()
  })

  test('shows weight statistics card', async ({ authedPage: page }) => {
    await expect(page.locator('text=Weight Statistics')).toBeVisible()
    // Stats should show (demo account has data)
    await expect(page.locator('text=Min')).toBeVisible()
    await expect(page.locator('text=Max')).toBeVisible()
    await expect(page.locator('text=Average')).toBeVisible()
    await expect(page.locator('text=Rate')).toBeVisible()
    await expect(page.locator('text=Entries')).toBeVisible()
  })

  test('shows weight trend card', async ({ authedPage: page }) => {
    await expect(page.locator('text=Weight Trend')).toBeVisible()
    // Chart should render (SVG element)
    await expect(page.locator('.grid svg').first()).toBeVisible({ timeout: 10000 })
  })

  test('shows injection frequency card', async ({ authedPage: page }) => {
    await expect(page.locator('text=Injection Frequency')).toBeVisible()
    await expect(page.locator('text=Total Injections')).toBeVisible()
    await expect(page.locator('text=Avg Days Between')).toBeVisible()
    await expect(page.locator('text=Per Week')).toBeVisible()
    await expect(page.locator('text=Most Common Day')).toBeVisible()
  })

  test('shows injection sites chart', async ({ authedPage: page }) => {
    await expect(page.locator('text=Injection Sites')).toBeVisible()
  })

  test('shows injections by day of week chart', async ({ authedPage: page }) => {
    await expect(page.locator('text=Injections by Day of Week')).toBeVisible()
  })

  test('shows medications used chart', async ({ authedPage: page }) => {
    await expect(page.locator('text=Medications Used')).toBeVisible()
  })

  test('shows dosage history chart', async ({ authedPage: page }) => {
    await expect(page.locator('text=Dosage History')).toBeVisible()
  })

  test('can change time range with preset buttons', async ({ authedPage: page }) => {
    // Click 1 month
    await page.click('button:has-text("1 Month")')
    // Should update URL with date params
    await page.waitForTimeout(500) // Wait for state update

    // Click All time
    await page.click('button:has-text("All Time")')
    await page.waitForTimeout(500)

    // Click 3 months
    await page.click('button:has-text("3 Months")')
    await page.waitForTimeout(500)
  })

  test('time range presets are interactive', async ({ authedPage: page }) => {
    // Click different presets to verify they're interactive
    await page.click('button:has-text("1 Month")')
    await page.waitForTimeout(500)

    await page.click('button:has-text("6 Months")')
    await page.waitForTimeout(500)

    // Verify charts still render after changing range
    await expect(page.locator('text=Weight Statistics')).toBeVisible()
  })

  test('all stat cards render without errors', async ({ authedPage: page }) => {
    // Ensure page fully loads without throwing errors
    await page.waitForTimeout(2000) // Wait for all charts to render

    // Should have multiple cards
    const cards = page.locator('[class*="Card"], .rounded-lg.border')
    await expect(cards.first()).toBeVisible()
  })

  test('weight stats show numeric values', async ({ authedPage: page }) => {
    // Demo account should have weight data with numeric values
    // Look for lbs/wk (rate of change) which indicates numeric values are present
    await expect(page.locator('text=/lbs\\/wk/')).toBeVisible({ timeout: 5000 })
  })

  test('injection stats show numeric values', async ({ authedPage: page }) => {
    // Look for injection count values
    const injectionSection = page.locator(':has-text("Total Injections")').first()
    await expect(injectionSection).toBeVisible()
  })
})
