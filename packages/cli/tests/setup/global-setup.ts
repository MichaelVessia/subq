import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Test configuration
export const TEST_PORT = 3002
export const TEST_USER = {
  email: 'cli-test@example.com',
  password: 'testpassword123',
  name: 'CLI Test User',
}

// Paths
const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '../../../..')
const API_DIR = join(PROJECT_ROOT, 'packages/api')
const TEST_DB_PATH = join(API_DIR, 'data/cli-test.db')
const TEST_HOME = join(PROJECT_ROOT, '.tmp/cli-test-home')

// Store server process for teardown
let serverProcess: ChildProcess | null = null

// Export paths for use in tests
export const testEnv = {
  SUBQ_API_URL: `http://localhost:${TEST_PORT}`,
  HOME: TEST_HOME,
  DATABASE_PATH: TEST_DB_PATH,
  BETTER_AUTH_SECRET: 'test-secret-for-cli-integration-tests-min-32-chars',
  BETTER_AUTH_URL: `http://localhost:${TEST_PORT}`,
}

async function waitForServer(url: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url)
      if (response.ok || response.status === 401) {
        return
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Server did not start within ${maxAttempts * 500}ms`)
}

async function setupDatabase(): Promise<void> {
  // Ensure data directory exists
  await mkdir(dirname(TEST_DB_PATH), { recursive: true })

  // Remove existing test database
  try {
    await rm(TEST_DB_PATH, { force: true })
    await rm(`${TEST_DB_PATH}-shm`, { force: true })
    await rm(`${TEST_DB_PATH}-wal`, { force: true })
  } catch {
    // Files may not exist
  }

  console.log(`Setting up test database: ${TEST_DB_PATH}`)

  // Run the setup script with bun (which supports bun:sqlite)
  const setupScript = join(__dirname, 'setup-db.ts')
  const result = spawnSync('bun', ['run', setupScript], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      TEST_DB_PATH,
      TEST_AUTH_SECRET: testEnv.BETTER_AUTH_SECRET,
      TEST_AUTH_URL: testEnv.BETTER_AUTH_URL,
      TEST_USER_EMAIL: TEST_USER.email,
      TEST_USER_PASSWORD: TEST_USER.password,
      TEST_USER_NAME: TEST_USER.name,
    },
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    throw new Error(`Database setup failed with exit code ${result.status}`)
  }

  console.log('Database setup complete')
}

async function startServer(): Promise<void> {
  console.log(`Starting test API server on port ${TEST_PORT}...`)
  console.log(`  API_DIR: ${API_DIR}`)
  console.log(`  DATABASE_PATH: ${TEST_DB_PATH}`)

  // Create test HOME directory for CLI session storage
  await mkdir(TEST_HOME, { recursive: true })

  // Write test environment to a file that tests can read
  const envFile = join(PROJECT_ROOT, '.tmp/cli-test-env.json')
  await mkdir(dirname(envFile), { recursive: true })
  await writeFile(envFile, JSON.stringify(testEnv))

  serverProcess = spawn('bun', ['run', 'src/main.ts'], {
    cwd: API_DIR,
    env: {
      ...process.env,
      DATABASE_PATH: TEST_DB_PATH,
      BETTER_AUTH_SECRET: testEnv.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: testEnv.BETTER_AUTH_URL,
      PORT: String(TEST_PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // Always log server errors to help debug startup issues
  serverProcess.stderr?.on('data', (data) => {
    console.error(`[API ERROR] ${data.toString().trim()}`)
  })

  // Log server output for debugging
  serverProcess.stdout?.on('data', (data) => {
    if (process.env.DEBUG) {
      console.log(`[API] ${data.toString().trim()}`)
    }
  })

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err)
  })

  // Wait for server to be ready
  await waitForServer(`${testEnv.SUBQ_API_URL}/api/auth/session`)
  console.log('Test API server is ready')
}

// Store process globally for teardown
declare global {
  // biome-ignore lint: Need global var for vitest teardown
  var __CLI_TEST_SERVER_PROCESS__: ChildProcess | null
}

export async function setup(): Promise<void> {
  console.log('\n=== CLI Integration Test Setup ===\n')
  await setupDatabase()
  await startServer()
  globalThis.__CLI_TEST_SERVER_PROCESS__ = serverProcess
  console.log('\n=== Setup Complete ===\n')
}

export default setup
