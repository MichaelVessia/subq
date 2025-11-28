import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://localhost:5173'
const isExternal = baseURL.startsWith('https://')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 10000, // 10s per test (down from 30s default)
  expect: {
    timeout: 3000, // 3s for assertions (down from 5s)
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    actionTimeout: 5000, // 5s for clicks, fills, etc.
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Only start local dev server when not testing external URL
  webServer: isExternal
    ? undefined
    : {
        command: 'bun run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
      },
})
