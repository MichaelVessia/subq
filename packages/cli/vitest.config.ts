import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/setup/global-setup.ts'],
    globalTeardown: ['tests/setup/global-teardown.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
