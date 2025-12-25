import { useNavigate } from '@tanstack/react-router'
import { AlertCircle, LogIn, RefreshCw, SearchX } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from './button.js'
import { Card, CardContent, CardHeader, CardTitle } from './card.js'

/**
 * Redirects to login page when session is unauthorized.
 * Shows a brief message before redirecting.
 */
export function UnauthorizedRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate({ to: '/auth/login' as string })
    }, 1500)
    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <Card>
      <CardContent className="py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <LogIn className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Session expired</p>
            <p className="text-sm text-muted-foreground">Redirecting to login...</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Shows a "not found" message for missing resources.
 */
export function NotFoundError({ resource = 'Resource' }: { resource?: string }) {
  return (
    <Card>
      <CardContent className="py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <SearchX className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">{resource} not found</p>
            <p className="text-sm text-muted-foreground">It may have been deleted or moved.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Shows a database/server error with optional retry.
 */
export function DatabaseError({ onRetry }: { onRetry?: () => void }) {
  return (
    <Card>
      <CardContent className="py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <div>
            <p className="font-medium">Something went wrong</p>
            <p className="text-sm text-muted-foreground">We couldn't load the data. Please try again.</p>
          </div>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Generic error display for unexpected errors.
 */
export function GenericError({ title, message }: { title?: string; message?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {title ?? 'Error'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{message ?? 'An unexpected error occurred.'}</p>
      </CardContent>
    </Card>
  )
}

/**
 * Inline error message (not in a card) for smaller contexts.
 */
export function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-destructive text-sm py-2">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  )
}
