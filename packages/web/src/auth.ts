import { createAuthClient } from 'better-auth/react'

// In production (Fly.io), API is same origin so use relative URL
// In local dev, API runs on different port
const baseURL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')

const authClient = createAuthClient({
  baseURL,
})

export const signIn = authClient.signIn
export const signUp = authClient.signUp
export const signOut = authClient.signOut
export const useSession = authClient.useSession
