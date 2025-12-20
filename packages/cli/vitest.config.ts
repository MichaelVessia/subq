import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    // Global setup/teardown for starting/stopping test server
    globalSetup: ['tests/setup/global-setup.ts'],
    globalTeardown: ['tests/setup/global-teardown.ts'],
    // Run tests sequentially since they share a server
    sequence: {
      concurrent: false,
    },
  },
})
