import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface CliResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface RunCliOptions {
  readonly home?: string
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
export async function runCli(args: string[], options: RunCliOptions = {}): Promise<CliResult> {
  const testEnv = await getTestEnv()

  return new Promise((resolve, reject) => {
    const proc = spawn('bun', ['run', CLI_MAIN, ...args], {
      env: {
        ...process.env,
        SUBQ_API_URL: testEnv.SUBQ_API_URL,
        HOME: options.home ?? testEnv.HOME,
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
 * Run a CLI command and parse JSON output.
 * Automatically adds --format json if not already present.
 * Inserts it after the subcommand but before any positional arguments.
 */
export async function runCliJson<T>(args: string[], options: RunCliOptions = {}): Promise<T> {
  // Add --format json if not already present
  const hasFormat = args.some((arg) => arg === '--format' || arg === '-f')

  let argsWithFormat: string[]
  if (hasFormat) {
    argsWithFormat = args
  } else {
    // Find insertion point: after command/subcommand, before positional args
    // Options start with - or --, positional args don't
    // Insert after the last option or subcommand
    let insertIdx = 0
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      // Skip commands/subcommands (first few args that don't start with -)
      // and skip options and their values
      if (arg.startsWith('-')) {
        // It's an option, skip it and its value if it has one
        insertIdx = i + 1
        if (!arg.includes('=') && i + 1 < args.length && !args[i + 1].startsWith('-')) {
          insertIdx = i + 2
        }
      } else if (i <= 1) {
        // It's a command/subcommand
        insertIdx = i + 1
      }
    }
    argsWithFormat = [...args.slice(0, insertIdx), '--format', 'json', ...args.slice(insertIdx)]
  }

  const result = await runCli(argsWithFormat, options)
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
export async function loginTestUser(options: RunCliOptions = {}): Promise<CliResult> {
  return runCli(['login', '--email', 'cli-test@example.com', '--password', 'testpassword123'], options)
}

/**
 * Logout current session
 */
export async function logout(options: RunCliOptions = {}): Promise<CliResult> {
  return runCli(['logout'], options)
}
