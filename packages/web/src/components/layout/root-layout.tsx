import { Link, Outlet, useLocation } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import { Toaster } from 'sonner'
import { signOut, useSession } from '../../auth.js'
import { cn } from '../../lib/utils.js'
import { Button } from '../ui/button.js'
import { LoginForm } from './login-form.js'

export function RootLayout() {
  const { data: session, isPending } = useSession()
  const location = useLocation()
  const pathname = location.pathname

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!session) {
    return <LoginForm />
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      <header className="flex flex-col gap-3 mb-6 pb-4 border-b sm:mb-8 sm:pb-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <img src="/logo.svg" alt="" className="h-6 w-6" />
            SubQ
          </h1>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-muted-foreground">{session.user.email}</span>
            <Link to="/settings">
              <Button variant="ghost" size="icon" title="Settings">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                signOut().then(() => {
                  window.location.href = '/stats'
                })
              }}
            >
              Sign Out
            </Button>
          </div>
        </div>

        <nav className="flex gap-4 sm:gap-6 overflow-x-auto scrollbar-hide">
          <Link
            to="/stats"
            className={cn(
              'py-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              pathname === '/stats'
                ? 'text-foreground border-foreground'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            Stats
          </Link>
          <Link
            to="/weight"
            className={cn(
              'py-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              pathname === '/weight'
                ? 'text-foreground border-foreground'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            Weight
          </Link>
          <Link
            to="/injection"
            className={cn(
              'py-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              pathname === '/injection'
                ? 'text-foreground border-foreground'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            Injections
          </Link>
          <Link
            to="/inventory"
            className={cn(
              'py-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              pathname === '/inventory'
                ? 'text-foreground border-foreground'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            Inventory
          </Link>
          <Link
            to="/schedule"
            className={cn(
              'py-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              pathname === '/schedule'
                ? 'text-foreground border-foreground'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}
          >
            Schedule
          </Link>
        </nav>
      </header>

      <main>
        <Outlet />
      </main>
      <Toaster position="top-center" richColors />
    </div>
  )
}
