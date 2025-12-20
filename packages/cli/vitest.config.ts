import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    root: resolve(__dirname),
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/setup/global-setup.ts'],
    globalTeardown: ['tests/setup/global-teardown.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
