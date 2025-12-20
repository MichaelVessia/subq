import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  // API unit tests - no special setup needed
  {
    test: {
      name: 'api',
      include: ['packages/api/tests/**/*.test.ts'],
    },
  },
  // CLI integration tests - needs server setup
  {
    test: {
      name: 'cli',
      include: ['packages/cli/tests/**/*.test.ts'],
      globalSetup: ['packages/cli/tests/setup/global-setup.ts'],
      globalTeardown: ['packages/cli/tests/setup/global-teardown.ts'],
      testTimeout: 30000,
      hookTimeout: 60000,
      // Run tests sequentially since they share a server
      sequence: {
        concurrent: false,
      },
    },
  },
])
