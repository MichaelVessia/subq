import type { ChildProcess } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '../../../..')
const TEST_HOME = join(PROJECT_ROOT, '.tmp/cli-test-home')

declare global {
  var __CLI_TEST_SERVER_PROCESS__: ChildProcess | null
}

export async function teardown(): Promise<void> {
  console.log('\n=== CLI Integration Test Teardown ===\n')

  const serverProcess = globalThis.__CLI_TEST_SERVER_PROCESS__

  if (serverProcess) {
    console.log('Stopping test API server...')
    serverProcess.kill('SIGTERM')

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        serverProcess?.kill('SIGKILL')
        resolve()
      }, 5000)

      serverProcess?.on('exit', () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }

  // Clean up test HOME directory
  try {
    await rm(TEST_HOME, { recursive: true, force: true })
    console.log('Cleaned up test HOME directory')
  } catch {
    // Ignore cleanup errors
  }

  console.log('Teardown complete')
}

export default teardown
