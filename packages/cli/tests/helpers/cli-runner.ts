import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface CliResult {
  stdout: string
  stderr: string
  exitCode: number
}

// Load test environment from file written by global setup
const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '../../../..')
const CLI_MAIN = join(PROJECT_ROOT, 'packages/cli/src/main.ts')

async function getTestEnv(): Promise<Record<string, string>> {
  const envFile = join(PROJECT_ROOT, '.tmp/cli-test-env.json')
  const content = await readFile(envFile, 'utf-8')
  return JSON.parse(content)
}

/**
 * Run a CLI command and capture output
 */
export async function runCli(args: string[]): Promise<CliResult> {
  const testEnv = await getTestEnv()

  return new Promise((resolve, reject) => {
    const proc = spawn('bun', ['run', CLI_MAIN, ...args], {
      env: {
        ...process.env,
        SUBQ_API_URL: testEnv.SUBQ_API_URL,
        HOME: testEnv.HOME,
        // Disable color output for easier parsing
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('error', reject)

    proc.on('close', (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 0,
      })
    })
  })
}

/**
 * Run a CLI command and parse JSON output
 */
export async function runCliJson<T>(args: string[]): Promise<T> {
  const result = await runCli(args)
  if (result.exitCode !== 0) {
    throw new Error(`CLI exited with code ${result.exitCode}: ${result.stderr || result.stdout}`)
  }
  try {
    return JSON.parse(result.stdout)
  } catch {
    throw new Error(`Failed to parse JSON output: ${result.stdout}`)
  }
}

/**
 * Login with test user credentials
 */
export async function loginTestUser(): Promise<CliResult> {
  return runCli(['login', '--email', 'cli-test@example.com', '--password', 'testpassword123'])
}

/**
 * Logout current session
 */
export async function logout(): Promise<CliResult> {
  return runCli(['logout'])
}
