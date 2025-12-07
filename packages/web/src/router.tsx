import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { InjectionLogList } from './components/injection/injection-log-list.js'
import { InventoryList } from './components/inventory/inventory-list.js'
import { SchedulePage } from './components/schedule/schedule-page.js'
import { ScheduleViewPage } from './components/schedule/schedule-view-page.js'
import { SettingsPage } from './components/settings/settings-page.js'
import { StatsPage } from './components/stats/StatsPage.js'
import { WeightLogList } from './components/weight/weight-log-list.js'
import { RootLayout } from './components/layout/root-layout.js'

// Search params type for pages with date range filtering
export interface DateRangeSearchParams {
  start?: string | undefined
  end?: string | undefined
}

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

const statsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stats',
  component: StatsPage,
  validateSearch: (search: Record<string, unknown>): DateRangeSearchParams => ({
    start: typeof search.start === 'string' ? search.start : undefined,
    end: typeof search.end === 'string' ? search.end : undefined,
  }),
})

const weightRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/weight',
  component: WeightLogList,
})

const injectionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/injection',
  component: InjectionLogList,
})

const inventoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/inventory',
  component: InventoryList,
})

const scheduleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/schedule',
  component: SchedulePage,
})

const scheduleViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/schedule/$scheduleId',
  component: ScheduleViewPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
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
