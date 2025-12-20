import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '../../../..')
const TEST_HOME = join(PROJECT_ROOT, '.tmp/cli-test-home')

export async function teardown(): Promise<void> {
  console.log('\n=== CLI Integration Test Teardown ===\n')

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
