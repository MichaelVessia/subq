import {
  SESSION_COOKIE_CACHE_MAX_AGE_SECONDS,
  SESSION_EXPIRES_IN_SECONDS,
  SESSION_REFRESH_INTERVAL_MS,
  SESSION_UPDATE_AGE_SECONDS,
} from '@subq/shared'
import { describe, expect, it } from '@codeforbreakfast/bun-test-effect'

describe('auth session timing config', () => {
  it('refreshes session before cookie cache expires', () => {
    expect(SESSION_REFRESH_INTERVAL_MS).toBeLessThan(SESSION_COOKIE_CACHE_MAX_AGE_SECONDS * 1000)
  })

  it('cookie cache max age is shorter than session lifetime', () => {
    expect(SESSION_COOKIE_CACHE_MAX_AGE_SECONDS).toBeLessThan(SESSION_EXPIRES_IN_SECONDS)
  })

  it('session update age is shorter than session lifetime', () => {
    expect(SESSION_UPDATE_AGE_SECONDS).toBeLessThan(SESSION_EXPIRES_IN_SECONDS)
  })
})
