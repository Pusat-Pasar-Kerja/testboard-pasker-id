import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { AppShell } from './layout/AppShell'
import { BugDetailPage } from './pages/BugDetailPage'
import { BugsPage } from './pages/BugsPage'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProjectGate } from './pages/ProjectGate'
import { ProjectsPage } from './pages/ProjectsPage'
import { RunDetailPage } from './pages/RunDetailPage'
import { RunsPage } from './pages/RunsPage'
import { TestCaseDetailPage } from './pages/TestCaseDetailPage'
import { TestCasesPage } from './pages/TestCasesPage'

/** Sitemap from docs/blueprint/docs/04_SITEMAP_AND_SCREEN_SPECS.md. */
export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/projects" replace /> },
  { path: '/login', element: <LoginPage /> },
  {
    element: <AppShell />,
    children: [
      { path: '/projects', element: <ProjectsPage /> },
      {
        path: '/projects/:projectCode',
        element: <ProjectGate />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'test-cases', element: <TestCasesPage /> },
          { path: 'test-cases/:caseId', element: <TestCaseDetailPage /> },
          { path: 'runs', element: <RunsPage /> },
          { path: 'runs/:runId', element: <RunDetailPage /> },
          { path: 'bugs', element: <BugsPage /> },
          { path: 'bugs/:bugId', element: <BugDetailPage /> },
          { path: 'cycles', element: <ComingSoonPage feature="cycles" /> },
          { path: 'evidence', element: <ComingSoonPage feature="evidence" /> },
          { path: 'imports', element: <ComingSoonPage feature="imports" /> },
          { path: 'reports', element: <ComingSoonPage feature="reports" /> },
          { path: 'members', element: <ComingSoonPage feature="team" /> },
          { path: 'settings', element: <ComingSoonPage feature="team" /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

/** Browser router honouring the Vite base path (e.g. '/testboard/' for a subpath deploy). */
export function createAppRouter() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'
  return createBrowserRouter(routes, { basename })
}
