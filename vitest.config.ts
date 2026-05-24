import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/api/tests/**/*.test.ts', 'packages/shared/tests/**/*.test.ts', 'packages/web/src/**/*.test.ts'],
    environment: 'node',
  },
})
