import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    // Run tests sequentially since they share a server
    sequence: {
      concurrent: false,
    },
  },
})
