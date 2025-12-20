import { defineConfig } from 'vitest/config'

// This config is now primarily for settings shared across all workspaces
// The actual test patterns are defined in vitest.workspace.ts
export default defineConfig({
  test: {
    // Workspace mode will use vitest.workspace.ts for test discovery
  },
})
