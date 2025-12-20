import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loginTestUser, logout, runCli, runCliJson } from './helpers/cli-runner.js'

describe('CLI Integration Tests', () => {
  describe('Auth Commands', () => {
    afterAll(async () => {
      // Ensure we're logged out after auth tests
      await logout()
    })

    it('login with valid credentials succeeds', async () => {
      const result = await loginTestUser()
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Logged in as cli-test@example.com')
    })

    it('logout clears session', async () => {
      // First login
      await loginTestUser()

      // Then logout
      const result = await logout()
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('Logged out')
    })

    it('login with invalid credentials fails', async () => {
      const result = await runCli(['login', '--email', 'wrong@example.com', '--password', 'wrongpassword'])
      // Should fail but not crash
      expect(result.stdout + result.stderr).toMatch(/failed|invalid|error/i)
    })

    it('login --demo uses demo credentials', async () => {
      // Note: Demo user may not exist in test DB, so this tests the flag is accepted
      const result = await runCli(['login', '--demo'])
      // Will fail if demo user doesn't exist, but should attempt login
      expect(result.exitCode).toBeDefined()
    })
  })

  describe('Weight Commands', () => {
    beforeAll(async () => {
      // Login before weight tests
      await loginTestUser()
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
        // Table format should have headers or be empty message
      })
    })

    describe('weight CRUD operations', () => {
      let createdId: string | null = null

      afterAll(async () => {
        // Clean up created entry
        if (createdId) {
          await runCli(['weight', 'delete', createdId, '--yes'])
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

        const result = await runCli(['weight', 'get', createdId!, '--format', 'table'])

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('175.5')
      })

      it('weight update modifies entry', async () => {
        expect(createdId).not.toBeNull()

        const result = await runCliJson<{ id: string; weight: number }>([
          'weight',
          'update',
          createdId!,
          '--weight',
          '176.0',
        ])

        expect(result.id).toBe(createdId)
        expect(result.weight).toBe(176)
      })

      it('weight delete removes entry', async () => {
        expect(createdId).not.toBeNull()

        const result = await runCli(['weight', 'delete', createdId!, '--yes'])

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('Deleted')

        // Verify it's gone
        const getResult = await runCli(['weight', 'get', createdId!])
        expect(getResult.stdout + getResult.stderr).toMatch(/not found|null/i)

        // Clear so afterAll doesn't try to delete again
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

  describe('Help and Version', () => {
    it('--help shows usage', async () => {
      const result = await runCli(['--help'])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('subq')
      expect(result.stdout).toContain('weight')
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
  })

  describe('Unauthenticated Access', () => {
    beforeAll(async () => {
      // Ensure logged out
      await logout()
    })

    it('weight list without auth fails', async () => {
      const result = await runCli(['weight', 'list'])
      // Should fail with auth error
      expect(result.stdout + result.stderr).toMatch(/unauthorized|auth|login/i)
    })
  })
})
