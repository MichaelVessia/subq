import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useSession } from '../../auth.js'
import { LoginForm } from './login-form.js'

export function LoginPage() {
  const { data: session, isPending } = useSession()
  const navigate = useNavigate()

  useEffect(() => {
    if (session && !isPending) {
      navigate({ to: '/stats' })
    }
  }, [session, isPending, navigate])

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (session) {
    return null // Will redirect
  }

  return <LoginForm />
}
