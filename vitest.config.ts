import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/tests/**/*.test.ts', 'packages/**/*.test.ts'],
    // Exclude CLI tests (need separate server), e2e tests (run via playwright), and external dirs
    exclude: [
      'packages/cli/**',
      '**/node_modules/**',
      '**/e2e/**',
      '**/*.spec.ts',
      '.context/**',
      '.beads/**',
      '.direnv/**',
    ],
  },
})
