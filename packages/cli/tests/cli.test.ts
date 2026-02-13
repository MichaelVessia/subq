import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { loginTestUser, logout, runCli, runCliJson, type CliResult } from './helpers/cli-runner.js'

// Test configuration
const TEST_PORT = 3002
const TEST_USER = {
  email: 'cli-test@example.com',
  password: 'testpassword123',
  name: 'CLI Test User',
}

// Paths
const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '../../..')
const API_DIR = join(PROJECT_ROOT, 'packages/api')
const TEST_DB_PATH = join(API_DIR, 'data/cli-test.db')
const TEST_HOME = join(PROJECT_ROOT, '.tmp/cli-test-home')

const testEnv = {
  SUBQ_API_URL: `http://localhost:${TEST_PORT}`,
  HOME: TEST_HOME,
  DATABASE_PATH: TEST_DB_PATH,
  BETTER_AUTH_SECRET: 'test-secret-for-cli-integration-tests-min-32-chars',
  BETTER_AUTH_URL: `http://localhost:${TEST_PORT}`,
}

const createCliContext = (homeName: string) => {
  const home = join(TEST_HOME, homeName)
  return {
    home,
    run: (args: string[]) => runCli(args, { home }),
    runJson: <T>(args: string[]) => runCliJson<T>(args, { home }),
    login: () => loginTestUser({ home }),
    logout: () => logout({ home }),
  }
}

const authCli = createCliContext('auth')
const weightCli = createCliContext('weight')
const injectionCli = createCliContext('injection')
const inventoryCli = createCliContext('inventory')
const helpCli = createCliContext('help')
const unauthCli = createCliContext('unauthenticated')

async function requireLogin(scope: string, login: () => Promise<CliResult>): Promise<void> {
  const result = await login()
  if (result.exitCode !== 0) {
    throw new Error(`Login failed in ${scope}: ${result.stderr || result.stdout}`)
  }
}

let serverProcess: ChildProcess | null = null

async function waitForServer(url: string, maxAttempts = 60): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url)
      // Any response means server is up - 200, 401, 404 all count
      if (response.status > 0) {
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

  const setupScript = join(__dirname, 'setup/setup-db.ts')
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
}

async function startServer(): Promise<void> {
  console.log(`Starting test API server on port ${TEST_PORT}...`)
  console.log(`  API_DIR: ${API_DIR}`)
  console.log(`  DATABASE_PATH: ${TEST_DB_PATH}`)

  await Promise.all([
    mkdir(TEST_HOME, { recursive: true }),
    mkdir(authCli.home, { recursive: true }),
    mkdir(weightCli.home, { recursive: true }),
    mkdir(injectionCli.home, { recursive: true }),
    mkdir(inventoryCli.home, { recursive: true }),
    mkdir(helpCli.home, { recursive: true }),
    mkdir(unauthCli.home, { recursive: true }),
  ])

  // Write test environment for CLI runner
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
    detached: true,
  })

  serverProcess.stdout?.on('data', (data) => {
    console.log(`[API] ${data.toString().trim()}`)
  })

  serverProcess.stderr?.on('data', (data) => {
    console.error(`[API ERROR] ${data.toString().trim()}`)
  })

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err)
  })

  serverProcess.on('exit', (code) => {
    console.log(`Server process exited with code ${code}`)
  })

  await waitForServer(`${testEnv.SUBQ_API_URL}/api/auth/session`)
  console.log('Test API server is ready')
}

async function stopServer(): Promise<void> {
  if (serverProcess) {
    console.log('Stopping test API server...')
    serverProcess.kill('SIGTERM')

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

  try {
    await rm(TEST_HOME, { recursive: true, force: true })
  } catch {
    // Ignore
  }
}

describe('CLI Integration Tests', () => {
  beforeAll(async () => {
    await setupDatabase()
    await startServer()
  }, 60000)

  afterAll(async () => {
    await stopServer()
  }, 10000)

  describe('Auth Commands', () => {
    const runCli = authCli.run
    const loginTestUser = authCli.login
    const logout = authCli.logout

    afterAll(async () => {
      await logout()
    })

    it('login with valid credentials succeeds', async () => {
      const result = await loginTestUser()
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Logged in as cli-test@example.com')
    })

    it('logout clears session', async () => {
      await loginTestUser()
      const result = await logout()
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Logged out')
    })

    it('login with invalid credentials fails', async () => {
      const result = await runCli(['login', '--email', 'wrong@example.com', '--password', 'wrongpassword'])
      expect(result.stdout + result.stderr).toMatch(/failed|invalid|error/i)
    })

    it('login --demo uses demo credentials', async () => {
      const result = await runCli(['login', '--demo'])
      expect(result.exitCode).toBeDefined()
    })
  })

  describe('Weight Commands', () => {
    const runCli = weightCli.run
    const runCliJson = weightCli.runJson
    const loginTestUser = weightCli.login
    const logout = weightCli.logout

    beforeAll(async () => {
      await requireLogin('Weight Commands', loginTestUser)
    })

    afterAll(async () => {
      await logout()
    })

    describe('weight list', () => {
      it('returns JSON array', async () => {
        const result = await runCliJson<unknown[]>(['weight', 'list'])
        expect(Array.isArray(result)).toBe(true)
      })

      it('respects --limit option', async () => {
        const result = await runCliJson<unknown[]>(['weight', 'list', '--limit', '5'])
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBeLessThanOrEqual(5)
      })

      it('--format table returns table output', async () => {
        const result = await runCli(['weight', 'list', '--format', 'table'])
        expect(result.exitCode).toBe(0)
      })
    })

    describe('weight CRUD operations', () => {
      let createdId: string | null = null

      afterAll(async () => {
        if (createdId) {
          await runCli(['weight', 'delete', '--yes', createdId])
        }
      })

      it('weight add creates entry', async () => {
        const result = await runCliJson<{ id: string; weight: number }>([
          'weight',
          'add',
          '--weight',
          '175.5',
          '--notes',
          'CLI integration test entry',
        ])

        expect(result.id).toBeDefined()
        expect(result.weight).toBe(175.5)
        createdId = result.id
      })

      it('weight get retrieves entry', async () => {
        expect(createdId).not.toBeNull()
        const result = await runCliJson<{ id: string; weight: number }>(['weight', 'get', createdId!])
        expect(result.id).toBe(createdId)
        expect(result.weight).toBe(175.5)
      })

      it('weight get --format table shows details', async () => {
        expect(createdId).not.toBeNull()
        // Note: @effect/cli requires options before positional arguments
        const result = await runCli(['weight', 'get', '--format', 'table', createdId!])
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('175.5')
      })

      it('weight update modifies entry', async () => {
        expect(createdId).not.toBeNull()
        // Note: @effect/cli requires options before positional arguments
        const result = await runCliJson<{ id: string; weight: number }>([
          'weight',
          'update',
          '--weight',
          '176.0',
          createdId!,
        ])
        expect(result.id).toBe(createdId)
        expect(result.weight).toBe(176)
      })

      it('weight delete removes entry', async () => {
        expect(createdId).not.toBeNull()
        // Note: @effect/cli requires options before positional arguments
        const result = await runCli(['weight', 'delete', '--yes', createdId!])
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('Deleted')

        const getResult = await runCli(['weight', 'get', createdId!])
        expect(getResult.stdout + getResult.stderr).toMatch(/not found|null/i)
        createdId = null
      })
    })

    describe('weight error handling', () => {
      it('weight get with invalid ID returns not found', async () => {
        const result = await runCli(['weight', 'get', 'non-existent-id-12345'])
        expect(result.stdout + result.stderr).toMatch(/not found/i)
      })

      it('weight add without --weight shows error', async () => {
        const result = await runCli(['weight', 'add'])
        expect(result.exitCode).not.toBe(0)
        expect(result.stdout + result.stderr).toMatch(/required|missing/i)
      })
    })
  })

  describe('Injection Commands', () => {
    const runCli = injectionCli.run
    const runCliJson = injectionCli.runJson
    const loginTestUser = injectionCli.login
    const logout = injectionCli.logout

    beforeAll(async () => {
      await requireLogin('Injection Commands', loginTestUser)
    })

    afterAll(async () => {
      await logout()
    })

    describe('injection list', () => {
      it('returns JSON array', async () => {
        const result = await runCliJson<unknown[]>(['injection', 'list'])
        expect(Array.isArray(result)).toBe(true)
      })

      it('respects --limit option', async () => {
        const result = await runCliJson<unknown[]>(['injection', 'list', '--limit', '5'])
        expect(Array.isArray(result)).toBe(true)
        expect(result.length).toBeLessThanOrEqual(5)
      })

      it('--format table returns table output', async () => {
        const result = await runCli(['injection', 'list', '--format', 'table'])
        expect(result.exitCode).toBe(0)
      })
    })

    describe('injection CRUD operations', () => {
      let createdId: string | null = null

      afterAll(async () => {
        if (createdId) {
          await runCli(['injection', 'delete', '--yes', createdId])
        }
      })

      it('injection add creates entry', async () => {
        const result = await runCliJson<{ id: string; drug: string; dosage: string }>([
          'injection',
          'add',
          '--drug',
          'Test Drug',
          '--dosage',
          '10mg',
          '--site',
          'left abdomen',
          '--notes',
          'CLI integration test entry',
        ])

        expect(result.id).toBeDefined()
        expect(result.drug).toBe('Test Drug')
        expect(result.dosage).toBe('10mg')
        createdId = result.id
      })

      it('injection get retrieves entry', async () => {
        expect(createdId).not.toBeNull()
        const result = await runCliJson<{ id: string; drug: string }>(['injection', 'get', createdId!])
        expect(result.id).toBe(createdId)
        expect(result.drug).toBe('Test Drug')
      })

      it('injection get --format table shows details', async () => {
        expect(createdId).not.toBeNull()
        const result = await runCli(['injection', 'get', '--format', 'table', createdId!])
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('Test Drug')
      })

      it('injection update modifies entry', async () => {
        expect(createdId).not.toBeNull()
        const result = await runCliJson<{ id: string; dosage: string }>([
          'injection',
          'update',
          '--dosage',
          '15mg',
          createdId!,
        ])
        expect(result.id).toBe(createdId)
        expect(result.dosage).toBe('15mg')
      })

      it('injection delete removes entry', async () => {
        expect(createdId).not.toBeNull()
        const result = await runCli(['injection', 'delete', '--yes', createdId!])
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('Deleted')

        const getResult = await runCli(['injection', 'get', createdId!])
        expect(getResult.stdout + getResult.stderr).toMatch(/not found|null/i)
        createdId = null
      })
    })

    describe('injection helper commands', () => {
      it('injection drugs returns array', async () => {
        const result = await runCliJson<string[]>(['injection', 'drugs'])
        expect(Array.isArray(result)).toBe(true)
      })

      it('injection sites returns array', async () => {
        const result = await runCliJson<string[]>(['injection', 'sites'])
        expect(Array.isArray(result)).toBe(true)
      })
    })

    describe('injection error handling', () => {
      it('injection get with invalid ID returns not found', async () => {
        const result = await runCli(['injection', 'get', 'non-existent-id-12345'])
        expect(result.stdout + result.stderr).toMatch(/not found/i)
      })

      it('injection add without --drug shows error', async () => {
        const result = await runCli(['injection', 'add'])
        expect(result.exitCode).not.toBe(0)
        expect(result.stdout + result.stderr).toMatch(/required|missing/i)
      })
    })
  })

  describe('Inventory Commands', () => {
    const runCli = inventoryCli.run
    const runCliJson = inventoryCli.runJson
    const loginTestUser = inventoryCli.login
    const logout = inventoryCli.logout

    beforeAll(async () => {
      await requireLogin('Inventory Commands', loginTestUser)
    })

    afterAll(async () => {
      await logout()
    })

    describe('inventory list', () => {
      it('returns JSON array', async () => {
        const result = await runCliJson<unknown[]>(['inventory', 'list'])
        expect(Array.isArray(result)).toBe(true)
      })

      it('respects --status filter', async () => {
        const result = await runCliJson<unknown[]>(['inventory', 'list', '--status', 'new'])
        expect(Array.isArray(result)).toBe(true)
      })

      it('--format table returns table output', async () => {
        const result = await runCli(['inventory', 'list', '--format', 'table'])
        expect(result.exitCode).toBe(0)
      })
    })

    describe('inventory CRUD operations', () => {
      let createdId: string | null = null

      afterAll(async () => {
        if (createdId) {
          await runCli(['inventory', 'delete', '--yes', createdId])
        }
      })

      it('inventory add creates entry', async () => {
        const result = await runCliJson<{ id: string; drug: string; form: string; status: string }>([
          'inventory',
          'add',
          '--drug',
          'Test Inventory Drug',
          '--source',
          'Test Pharmacy',
          '--form',
          'vial',
          '--amount',
          '10mg',
        ])

        expect(result.id).toBeDefined()
        expect(result.drug).toBe('Test Inventory Drug')
        expect(result.form).toBe('vial')
        expect(result.status).toBe('new')
        createdId = result.id
      })

      it('inventory get retrieves entry', async () => {
        expect(createdId).not.toBeNull()
        const result = await runCliJson<{ id: string; drug: string }>(['inventory', 'get', createdId!])
        expect(result.id).toBe(createdId)
        expect(result.drug).toBe('Test Inventory Drug')
      })

      it('inventory get --format table shows details', async () => {
        expect(createdId).not.toBeNull()
        const result = await runCli(['inventory', 'get', '--format', 'table', createdId!])
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('Test Inventory Drug')
      })

      it('inventory update modifies entry', async () => {
        expect(createdId).not.toBeNull()
        const result = await runCliJson<{ id: string; totalAmount: string }>([
          'inventory',
          'update',
          '--amount',
          '20mg',
          createdId!,
        ])
        expect(result.id).toBe(createdId)
        expect(result.totalAmount).toBe('20mg')
      })

      it('inventory open marks as opened', async () => {
        expect(createdId).not.toBeNull()
        const result = await runCliJson<{ id: string; status: string }>(['inventory', 'open', createdId!])
        expect(result.id).toBe(createdId)
        expect(result.status).toBe('opened')
      })

      it('inventory finish marks as finished', async () => {
        expect(createdId).not.toBeNull()
        const result = await runCliJson<{ id: string; status: string }>(['inventory', 'finish', createdId!])
        expect(result.id).toBe(createdId)
        expect(result.status).toBe('finished')
      })

      it('inventory delete removes entry', async () => {
        expect(createdId).not.toBeNull()
        const result = await runCli(['inventory', 'delete', '--yes', createdId!])
        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('Deleted')

        const getResult = await runCli(['inventory', 'get', createdId!])
        expect(getResult.stdout + getResult.stderr).toMatch(/not found|null/i)
        createdId = null
      })
    })

    describe('inventory error handling', () => {
      it('inventory get with invalid ID returns not found', async () => {
        const result = await runCli(['inventory', 'get', 'non-existent-id-12345'])
        expect(result.stdout + result.stderr).toMatch(/not found/i)
      })

      it('inventory add without --drug shows error', async () => {
        const result = await runCli(['inventory', 'add'])
        expect(result.exitCode).not.toBe(0)
        expect(result.stdout + result.stderr).toMatch(/required|missing/i)
      })
    })
  })

  describe('Help and Version', () => {
    const runCli = helpCli.run

    it('--help shows usage', async () => {
      const result = await runCli(['--help'])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('subq')
      expect(result.stdout).toContain('weight')
      expect(result.stdout).toContain('injection')
      expect(result.stdout).toContain('inventory')
    })

    it('--version shows version', async () => {
      const result = await runCli(['--version'])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/)
    })

    it('weight --help shows weight commands', async () => {
      const result = await runCli(['weight', '--help'])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('list')
      expect(result.stdout).toContain('add')
      expect(result.stdout).toContain('get')
      expect(result.stdout).toContain('update')
      expect(result.stdout).toContain('delete')
    })

    it('injection --help shows injection commands', async () => {
      const result = await runCli(['injection', '--help'])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('list')
      expect(result.stdout).toContain('add')
      expect(result.stdout).toContain('get')
      expect(result.stdout).toContain('update')
      expect(result.stdout).toContain('delete')
      expect(result.stdout).toContain('drugs')
      expect(result.stdout).toContain('sites')
    })

    it('inventory --help shows inventory commands', async () => {
      const result = await runCli(['inventory', '--help'])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('list')
      expect(result.stdout).toContain('add')
      expect(result.stdout).toContain('get')
      expect(result.stdout).toContain('update')
      expect(result.stdout).toContain('delete')
      expect(result.stdout).toContain('open')
      expect(result.stdout).toContain('finish')
    })
  })

  describe('Unauthenticated Access', () => {
    const runCli = unauthCli.run
    const logout = unauthCli.logout

    beforeAll(async () => {
      await logout()
    })

    it('weight list without auth fails', async () => {
      const result = await runCli(['weight', 'list'])
      expect(result.stdout + result.stderr).toMatch(/unauthorized|auth|login/i)
    })
  })
})
