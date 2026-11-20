import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { AppShell } from './layout/AppShell'
import { RequireAuth } from './layout/RequireAuth'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { BugDetailPage } from './pages/BugDetailPage'
import { BugFormPage } from './pages/BugFormPage'
import { BugsPage } from './pages/BugsPage'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { CyclesPage } from './pages/CyclesPage'
import { DashboardPage } from './pages/DashboardPage'
import { ExecutionPage } from './pages/ExecutionPage'
import { LoginPage } from './pages/LoginPage'
import { MembersPage } from './pages/MembersPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProfilePage } from './pages/ProfilePage'
import { ProjectGate } from './pages/ProjectGate'
import { ProjectSettingsPage } from './pages/ProjectSettingsPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { RunDetailPage } from './pages/RunDetailPage'
import { RunFormPage } from './pages/RunFormPage'
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
          { path: 'runs/new', element: <RunFormPage mode="create" /> },
          { path: 'runs/:runId', element: <RunDetailPage /> },
          { path: 'runs/:runId/edit', element: <RunFormPage mode="edit" /> },
          { path: 'runs/:runId/cases/:runCaseId', element: <ExecutionPage /> },
          { path: 'bugs', element: <BugsPage /> },
          { path: 'bugs/new', element: <BugFormPage mode="create" /> },
          { path: 'bugs/:bugId', element: <BugDetailPage /> },
          { path: 'bugs/:bugId/edit', element: <BugFormPage mode="edit" /> },
          { path: 'cycles', element: <CyclesPage /> },
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
