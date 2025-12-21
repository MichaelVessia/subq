import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://localhost:5173'
const isExternal = baseURL.startsWith('https://')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 6,
  reporter: process.env.CI ? 'dot' : 'html',
  timeout: 10000,
  expect: {
    timeout: 3000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    actionTimeout: 5000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start both API and web servers when testing locally
  webServer: isExternal
    ? undefined
    : {
        command:
          'mkdir -p packages/api/data && BETTER_AUTH_SECRET=e2e-test-secret-must-be-at-least-32-characters-long BETTER_AUTH_URL=http://localhost:3001 bun run dev:api & (cd packages/web && bunx vite --port 5173) & wait',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        cwd: '../..',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 120000,
      },
})
