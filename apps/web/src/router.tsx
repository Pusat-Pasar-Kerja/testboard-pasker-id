import type { ComponentType } from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { AppShell } from './layout/AppShell'
import { EasyLayout } from './layout/EasyLayout'
import { FirstLoad } from './layout/FirstLoad'
import { HomeGate } from './layout/HomeGate'
import { RequireAuth } from './layout/RequireAuth'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProjectGate } from './pages/ProjectGate'
import { PublicHomePage } from './pages/PublicHomePage'
import { RecoverPage } from './pages/RecoverPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { TableBugsPage } from './pages/TableBugsPage'
import { TableFeaturePage } from './pages/TableFeaturePage'
import { TableHomePage } from './pages/TableHomePage'
import { TableJoinPage } from './pages/TableJoinPage'

/**
 * Pages for signed-in staff are loaded on demand, so a participant's phone on venue Wi-Fi
 * only downloads the public pages and Mode Mudah (ADR 0016).
 */
const page = (load: () => Promise<ComponentType>): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => ({ Component: await load() }),
})

/** Full-screen staff pages (projector, printing): signed in, without the app shell. */
const signedIn = (load: () => Promise<ComponentType>) =>
  page(async () => {
    const Page = await load()
    return function SignedInPage() {
      return (
        <RequireAuth>
          <Page />
        </RequireAuth>
      )
    }
  })

/** Sitemap from docs/blueprint/docs/04_SITEMAP_AND_SCREEN_SPECS.md. */
const pages: RouteObject[] = [
  // Front page: the public Fases for visitors; staff go to their projects, a table card to
  // Mode Mudah (ADR 0016).
  { path: '/', element: <HomeGate /> },
  { path: '/publik', element: <PublicHomePage /> },
  {
    path: '/publik/:cycleId',
    ...page(async () => (await import('./pages/PublicCyclePage')).PublicCyclePage),
  },
  { path: '/panduan', ...page(async () => (await import('./pages/GuidePage')).GuidePage) },
  { path: '/meja', element: <TableJoinPage /> },
  {
    path: '/meja/kerja',
    element: <EasyLayout />,
    children: [
      { index: true, element: <TableHomePage /> },
      { path: 'fitur/:moduleId', element: <TableFeaturePage /> },
      { path: 'masalah', element: <TableBugsPage /> },
    ],
  },
  { path: '/login', element: <LoginPage /> },
  // Account recovery (ADR 0012): reachable while signed out.
  { path: '/recover', element: <RecoverPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/layar/:projectCode/:cycleId',
    ...signedIn(async () => (await import('./pages/BigScreenPage')).BigScreenPage),
  },
  {
    path: '/cetak/kartu/:projectCode/:cycleId',
    ...signedIn(async () => (await import('./pages/PrintPages')).PrintCardsPage),
  },
  {
    path: '/cetak/lembar/:projectCode/:cycleId/:tableId',
    ...signedIn(async () => (await import('./pages/PrintPages')).PrintSheetPage),
  },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      {
        path: '/projects',
        ...page(async () => (await import('./pages/ProjectsPage')).ProjectsPage),
      },
      { path: '/profile', ...page(async () => (await import('./pages/ProfilePage')).ProfilePage) },
      { path: '/admin', element: <Navigate to="/admin/projects" replace /> },
      {
        path: '/admin/projects',
        ...page(async () => (await import('./pages/AdminProjectsPage')).AdminProjectsPage),
      },
      {
        path: '/admin/users',
        ...page(async () => (await import('./pages/AdminUsersPage')).AdminUsersPage),
      },
      {
        path: '/admin/recovery',
        ...page(async () => (await import('./pages/AdminRecoveryPage')).AdminRecoveryPage),
      },
      {
        path: '/admin/settings',
        ...page(async () => (await import('./pages/AdminSettingsPage')).AdminSettingsPage),
      },
      {
        path: '/admin/audit',
        ...page(async () => (await import('./pages/AdminAuditPage')).AdminAuditPage),
      },
      {
        path: '/projects/:projectCode',
        element: <ProjectGate />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          {
            path: 'dashboard',
            ...page(async () => (await import('./pages/DashboardPage')).DashboardPage),
          },
          {
            path: 'test-cases',
            ...page(async () => (await import('./pages/TestCasesPage')).TestCasesPage),
          },
          {
            path: 'test-cases/new',
            ...page(async () => {
              const { TestCaseFormPage } = await import('./pages/TestCaseFormPage')
              return function NewTestCasePage() {
                return <TestCaseFormPage mode="create" />
              }
            }),
          },
          {
            path: 'test-cases/similar',
            ...page(async () => (await import('./pages/SimilarCasesPage')).SimilarCasesPage),
          },
          {
            path: 'test-cases/:caseId',
            ...page(async () => (await import('./pages/TestCaseDetailPage')).TestCaseDetailPage),
          },
          {
            path: 'test-cases/:caseId/edit',
            ...page(async () => {
              const { TestCaseFormPage } = await import('./pages/TestCaseFormPage')
              return function EditTestCasePage() {
                return <TestCaseFormPage mode="edit" />
              }
            }),
          },
          { path: 'runs', ...page(async () => (await import('./pages/RunsPage')).RunsPage) },
          {
            path: 'runs/new',
            ...page(async () => {
              const { RunFormPage } = await import('./pages/RunFormPage')
              return function NewRunPage() {
                return <RunFormPage mode="create" />
              }
            }),
          },
          {
            path: 'runs/:runId',
            ...page(async () => (await import('./pages/RunDetailPage')).RunDetailPage),
          },
          {
            path: 'runs/:runId/edit',
            ...page(async () => {
              const { RunFormPage } = await import('./pages/RunFormPage')
              return function EditRunPage() {
                return <RunFormPage mode="edit" />
              }
            }),
          },
          {
            path: 'runs/:runId/cases/:runCaseId',
            ...page(async () => (await import('./pages/ExecutionPage')).ExecutionPage),
          },
          { path: 'bugs', ...page(async () => (await import('./pages/BugsPage')).BugsPage) },
          {
            path: 'bugs/new',
            ...page(async () => {
              const { BugFormPage } = await import('./pages/BugFormPage')
              return function NewBugPage() {
                return <BugFormPage mode="create" />
              }
            }),
          },
          {
            path: 'bugs/:bugId',
            ...page(async () => (await import('./pages/BugDetailPage')).BugDetailPage),
          },
          {
            path: 'bugs/:bugId/edit',
            ...page(async () => {
              const { BugFormPage } = await import('./pages/BugFormPage')
              return function EditBugPage() {
                return <BugFormPage mode="edit" />
              }
            }),
          },
          { path: 'cycles', ...page(async () => (await import('./pages/CyclesPage')).CyclesPage) },
          {
            path: 'workshop',
            ...page(async () => (await import('./pages/WorkshopPage')).WorkshopIndexPage),
          },
          {
            path: 'workshop/:cycleId',
            ...page(async () => (await import('./pages/WorkshopPage')).WorkshopPage),
          },
          {
            path: 'evidence',
            ...page(async () => (await import('./pages/EvidencePage')).EvidencePage),
          },
          {
            path: 'imports',
            ...page(async () => (await import('./pages/ImportsPage')).ImportsPage),
          },
          {
            path: 'imports/:jobId',
            ...page(async () => (await import('./pages/ImportJobPage')).ImportJobPage),
          },
          {
            path: 'reports',
            ...page(async () => (await import('./pages/ReportsPage')).ReportsPage),
          },
          {
            path: 'members',
            ...page(async () => (await import('./pages/MembersPage')).MembersPage),
          },
          {
            path: 'settings',
            ...page(async () => (await import('./pages/ProjectSettingsPage')).ProjectSettingsPage),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const routes: RouteObject[] = [{ HydrateFallback: FirstLoad, children: pages }]

/** Browser router honouring the Vite base path (e.g. '/testboard/' for a subpath deploy). */
export function createAppRouter() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'
  return createBrowserRouter(routes, { basename })
}
