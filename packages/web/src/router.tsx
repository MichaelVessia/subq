import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { InjectionLogList } from './components/injection/injection-log-list.js'
import { InventoryList } from './components/inventory/inventory-list.js'
import { AppLayout } from './components/layout/app-layout.js'
import { LoginPage } from './components/layout/login-page.js'
import { RootLayout } from './components/layout/root-layout.js'
import { SchedulePage } from './components/schedule/schedule-page.js'
import { ScheduleViewPage } from './components/schedule/schedule-view-page.js'
import { SettingsPage } from './components/settings/settings-page.js'
import { StatsPage } from './components/stats/StatsPage.js'
import { WeightLogList } from './components/weight/weight-log-list.js'

// Search params type for pages with date range filtering
export interface DateRangeSearchParams {
  start?: string | undefined
  end?: string | undefined
}

// Root layout - just provides Toaster
const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/stats' })
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

// Authenticated routes use AppLayout directly as component wrapper
const statsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stats',
  component: () => (
    <AppLayout>
      <StatsPage />
    </AppLayout>
  ),
  validateSearch: (search: Record<string, unknown>): DateRangeSearchParams => ({
    start: typeof search.start === 'string' ? search.start : undefined,
    end: typeof search.end === 'string' ? search.end : undefined,
  }),
})

const weightRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/weight',
  component: () => (
    <AppLayout>
      <WeightLogList />
    </AppLayout>
  ),
})

const injectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/injection',
  component: () => (
    <AppLayout>
      <InjectionLogList />
    </AppLayout>
  ),
})

const inventoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/inventory',
  component: () => (
    <AppLayout>
      <InventoryList />
    </AppLayout>
  ),
})

const scheduleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/schedule',
  component: () => (
    <AppLayout>
      <SchedulePage />
    </AppLayout>
  ),
})

const scheduleViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/schedule/$scheduleId',
  component: () => (
    <AppLayout>
      <ScheduleViewPage />
    </AppLayout>
  ),
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: () => (
    <AppLayout>
      <SettingsPage />
    </AppLayout>
  ),
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  statsRoute,
  weightRoute,
  injectionRoute,
  inventoryRoute,
  scheduleRoute,
  scheduleViewRoute,
  settingsRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
