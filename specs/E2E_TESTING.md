# E2E Testing with Playwright

## Purpose

Test the complete user flow from browser UI to database and back. E2E tests complement unit and integration tests by verifying:
- Authentication flows
- Protected route access
- Multi-step workflows
- State management across pages
- API-UI integration

## Technology Stack

- **Playwright** - Browser automation
- **@playwright/test** - Test runner with fixtures
- **Vite** - Dev server for test environment

## Project Structure

```
packages/web/
  e2e/
    fixtures/
      auth.ts           # Authentication helpers
      data.ts           # Test data factories
    tests/
      auth.spec.ts      # Login/logout flows
      dashboard.spec.ts # Main app flows
      weight.spec.ts    # Feature-specific tests
    playwright.config.ts
```

## Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } }
  ],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI
  }
})
```

## Test Fixtures

### Authentication Fixture

```typescript
// e2e/fixtures/auth.ts
import { test as base, expect } from "@playwright/test"

interface AuthFixtures {
  authenticatedPage: Page
  testUser: { email: string; password: string }
}

export const test = base.extend<AuthFixtures>({
  testUser: async ({}, use) => {
    const user = {
      email: `test-${Date.now()}@example.com`,
      password: "TestPassword123!"
    }
    // Register user via API
    await fetch("http://localhost:3001/api/auth/sign-up", {
      method: "POST",
      body: JSON.stringify(user)
    })
    await use(user)
  },

  authenticatedPage: async ({ page, testUser }, use) => {
    await page.goto("/login")
    await page.getByLabel("Email").fill(testUser.email)
    await page.getByLabel("Password").fill(testUser.password)
    await page.getByRole("button", { name: "Sign In" }).click()
    await expect(page).toHaveURL("/dashboard")
    await use(page)
  }
})

export { expect } from "@playwright/test"
```

## Test Patterns

### Authentication Flow

```typescript
// e2e/tests/auth.spec.ts
import { test, expect } from "../fixtures/auth"

test.describe("Authentication", () => {
  test("successful login redirects to dashboard", async ({ page, testUser }) => {
    await page.goto("/login")
    await page.getByLabel("Email").fill(testUser.email)
    await page.getByLabel("Password").fill(testUser.password)
    await page.getByRole("button", { name: "Sign In" }).click()

    await expect(page).toHaveURL("/dashboard")
    await expect(page.getByText("Welcome")).toBeVisible()
  })

  test("invalid credentials show error", async ({ page }) => {
    await page.goto("/login")
    await page.getByLabel("Email").fill("wrong@example.com")
    await page.getByLabel("Password").fill("wrongpassword")
    await page.getByRole("button", { name: "Sign In" }).click()

    await expect(page.getByText("Invalid credentials")).toBeVisible()
    await expect(page).toHaveURL("/login")
  })

  test("logout clears session", async ({ authenticatedPage: page }) => {
    await page.getByRole("button", { name: "Logout" }).click()

    await expect(page).toHaveURL("/login")
    await page.goto("/dashboard")
    await expect(page).toHaveURL("/login")
  })
})
```

### Protected Routes

```typescript
test("redirects unauthenticated users to login", async ({ page }) => {
  await page.goto("/dashboard")
  await expect(page).toHaveURL("/login")
})

test("preserves intended destination after login", async ({ page, testUser }) => {
  await page.goto("/weight/history")
  await expect(page).toHaveURL(/login.*redirect/)

  await page.getByLabel("Email").fill(testUser.email)
  await page.getByLabel("Password").fill(testUser.password)
  await page.getByRole("button", { name: "Sign In" }).click()

  await expect(page).toHaveURL("/weight/history")
})
```

### Form Interactions

```typescript
test("creates weight entry", async ({ authenticatedPage: page }) => {
  await page.goto("/weight/new")

  await page.getByLabel("Weight").fill("150.5")
  await page.getByLabel("Date").fill("2024-01-15")
  await page.getByLabel("Notes").fill("Morning weigh-in")
  await page.getByRole("button", { name: "Save" }).click()

  await expect(page.getByText("Entry saved")).toBeVisible()
  await expect(page).toHaveURL("/weight")
})
```

## Running Tests

```bash
# Run all E2E tests
bun run test:e2e

# Run with UI mode for debugging
bun run test:e2e:ui

# Run specific test file
bunx playwright test e2e/tests/auth.spec.ts

# Run in headed mode
bun run test:e2e:headed
```

## Best Practices

1. **Use data-testid for stability** - Prefer `data-testid` selectors over text or CSS
2. **API-based setup** - Create test data via API, verify via UI
3. **Test isolation** - Each test should be independent
4. **Wait for network** - Use `waitForResponse` for API calls
5. **Avoid flaky tests** - Use proper waits, not arbitrary timeouts
6. **Screenshot on failure** - Auto-enabled for debugging
7. **Trace viewer** - Use for debugging complex failures

## CI Integration

```yaml
# .github/workflows/e2e.yml
- name: Install Playwright Browsers
  run: bunx playwright install --with-deps

- name: Run E2E tests
  run: bun run test:e2e

- name: Upload test artifacts
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: packages/web/playwright-report/
```
