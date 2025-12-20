import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/tests/**/*.test.ts', 'packages/**/*.test.ts'],
    // Exclude CLI tests - they require bun runtime and have their own vitest config
    exclude: ['packages/cli/**'],
  },
})
