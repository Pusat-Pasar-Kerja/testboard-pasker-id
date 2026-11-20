import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { AppShell } from './layout/AppShell'
import { RequireAuth } from './layout/RequireAuth'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { BugDetailPage } from './pages/BugDetailPage'
import { BugsPage } from './pages/BugsPage'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MembersPage } from './pages/MembersPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProfilePage } from './pages/ProfilePage'
import { ProjectGate } from './pages/ProjectGate'
import { ProjectSettingsPage } from './pages/ProjectSettingsPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { RunDetailPage } from './pages/RunDetailPage'
import { RunsPage } from './pages/RunsPage'
import { TestCaseDetailPage } from './pages/TestCaseDetailPage'
import { TestCaseFormPage } from './pages/TestCaseFormPage'
import { TestCasesPage } from './pages/TestCasesPage'

/** Sitemap from docs/blueprint/docs/04_SITEMAP_AND_SCREEN_SPECS.md. */
export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/projects" replace /> },
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { path: '/projects', element: <ProjectsPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/admin/users', element: <AdminUsersPage /> },
      {
        path: '/projects/:projectCode',
        element: <ProjectGate />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'test-cases', element: <TestCasesPage /> },
          { path: 'test-cases/new', element: <TestCaseFormPage mode="create" /> },
          { path: 'test-cases/:caseId', element: <TestCaseDetailPage /> },
          { path: 'test-cases/:caseId/edit', element: <TestCaseFormPage mode="edit" /> },
          { path: 'runs', element: <RunsPage /> },
          { path: 'runs/:runId', element: <RunDetailPage /> },
          { path: 'bugs', element: <BugsPage /> },
          { path: 'bugs/:bugId', element: <BugDetailPage /> },
          { path: 'cycles', element: <ComingSoonPage feature="cycles" /> },
          { path: 'evidence', element: <ComingSoonPage feature="evidence" /> },
          { path: 'imports', element: <ComingSoonPage feature="imports" /> },
          { path: 'reports', element: <ComingSoonPage feature="reports" /> },
          { path: 'members', element: <MembersPage /> },
          { path: 'settings', element: <ProjectSettingsPage /> },
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
