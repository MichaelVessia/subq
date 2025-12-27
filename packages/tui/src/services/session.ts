// Session management for the TUI
// Stores auth session in ~/.config/subq/session.json

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface StoredSession {
  sessionToken: string
  sessionData: string
  userId: string
  email: string
  expiresAt: Date
  isSecure: boolean
}

const CONFIG_DIR = path.join(process.env.HOME ?? '~', '.config', 'subq')
const SESSION_FILE = path.join(CONFIG_DIR, 'session.json')

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

export function getSession(): StoredSession | null {
  try {
    if (!fs.existsSync(SESSION_FILE)) {
      return null
    }

    const content = fs.readFileSync(SESSION_FILE, 'utf-8')
    const parsed = JSON.parse(content) as StoredSession
    parsed.expiresAt = new Date(parsed.expiresAt)

    // Check if expired
    if (parsed.expiresAt < new Date()) {
      fs.unlinkSync(SESSION_FILE)
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function saveSession(session: StoredSession): void {
  ensureConfigDir()
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2))
}

export function clearSession(): void {
  if (fs.existsSync(SESSION_FILE)) {
    fs.unlinkSync(SESSION_FILE)
  }
}
