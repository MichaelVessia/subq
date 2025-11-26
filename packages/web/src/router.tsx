import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { Dashboard } from './components/dashboard/Dashboard.js'
import { InjectionLogList } from './components/injection/InjectionLogList.js'
import { StatsPage } from './components/stats/StatsPage.js'
import { WeightLogList } from './components/weight/WeightLogList.js'
import { RootLayout } from './components/layout/RootLayout.js'

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
    throw redirect({ to: '/dashboard' })
  },
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: Dashboard,
  validateSearch: (search: Record<string, unknown>): DateRangeSearchParams => ({
    start: typeof search.start === 'string' ? search.start : undefined,
    end: typeof search.end === 'string' ? search.end : undefined,
  }),
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

const routeTree = rootRoute.addChildren([indexRoute, dashboardRoute, statsRoute, weightRoute, injectionRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
