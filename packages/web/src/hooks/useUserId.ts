import { useSession } from '../auth.js'

/**
 * Hook to get the current user's ID from the session.
 * Returns null if not authenticated.
 */
export function useUserId(): string | null {
  const { data: session } = useSession()
  return session?.user?.id ?? null
}
