import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { AppShell } from './layout/AppShell'
import { EasyLayout } from './layout/EasyLayout'
import { HomeGate } from './layout/HomeGate'
import { RequireAuth } from './layout/RequireAuth'
import { AdminAuditPage } from './pages/AdminAuditPage'
import { AdminProjectsPage } from './pages/AdminProjectsPage'
import { AdminRecoveryPage } from './pages/AdminRecoveryPage'
import { AdminSettingsPage } from './pages/AdminSettingsPage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { BugDetailPage } from './pages/BugDetailPage'
import { BugFormPage } from './pages/BugFormPage'
import { BugsPage } from './pages/BugsPage'
import { ReportsPage } from './pages/ReportsPage'
import { CyclesPage } from './pages/CyclesPage'
import { DashboardPage } from './pages/DashboardPage'
import { EvidencePage } from './pages/EvidencePage'
import { ImportJobPage } from './pages/ImportJobPage'
import { ImportsPage } from './pages/ImportsPage'
import { ExecutionPage } from './pages/ExecutionPage'
import { LoginPage } from './pages/LoginPage'
import { MembersPage } from './pages/MembersPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { GuidePage } from './pages/GuidePage'
import { ProfilePage } from './pages/ProfilePage'
import { PublicCyclePage } from './pages/PublicCyclePage'
import { PublicHomePage } from './pages/PublicHomePage'
import { TableBugsPage } from './pages/TableBugsPage'
import { TableFeaturePage } from './pages/TableFeaturePage'
import { TableHomePage } from './pages/TableHomePage'
import { TableJoinPage } from './pages/TableJoinPage'
import { ProjectGate } from './pages/ProjectGate'
import { ProjectSettingsPage } from './pages/ProjectSettingsPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { RecoverPage } from './pages/RecoverPage'
import { SimilarCasesPage } from './pages/SimilarCasesPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { RunDetailPage } from './pages/RunDetailPage'
import { RunFormPage } from './pages/RunFormPage'
import { RunsPage } from './pages/RunsPage'
import { TestCaseDetailPage } from './pages/TestCaseDetailPage'
import { TestCaseFormPage } from './pages/TestCaseFormPage'
import { TestCasesPage } from './pages/TestCasesPage'
import { BigScreenPage } from './pages/BigScreenPage'
import { PrintCardsPage, PrintSheetPage } from './pages/PrintPages'
import { WorkshopIndexPage, WorkshopPage } from './pages/WorkshopPage'

/** Sitemap from docs/blueprint/docs/04_SITEMAP_AND_SCREEN_SPECS.md. */
export const routes: RouteObject[] = [
  // Front page: the public Fases for visitors; staff go to their projects, a table card to
  // Mode Mudah (ADR 0016).
  { path: '/', element: <HomeGate /> },
  { path: '/publik', element: <PublicHomePage /> },
  { path: '/publik/:cycleId', element: <PublicCyclePage /> },
  { path: '/panduan', element: <GuidePage /> },
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
  // Full-screen pages for facilitators (projector, printing): signed in, no app shell.
  {
    path: '/layar/:projectCode/:cycleId',
    element: (
      <RequireAuth>
        <BigScreenPage />
      </RequireAuth>
    ),
  },
  {
    path: '/cetak/kartu/:projectCode/:cycleId',
    element: (
      <RequireAuth>
        <PrintCardsPage />
      </RequireAuth>
    ),
  },
  {
    path: '/cetak/lembar/:projectCode/:cycleId/:tableId',
    element: (
      <RequireAuth>
        <PrintSheetPage />
      </RequireAuth>
    ),
  },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { path: '/projects', element: <ProjectsPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/admin', element: <Navigate to="/admin/projects" replace /> },
      { path: '/admin/projects', element: <AdminProjectsPage /> },
      { path: '/admin/users', element: <AdminUsersPage /> },
      { path: '/admin/recovery', element: <AdminRecoveryPage /> },
      { path: '/admin/settings', element: <AdminSettingsPage /> },
      { path: '/admin/audit', element: <AdminAuditPage /> },
      {
        path: '/projects/:projectCode',
        element: <ProjectGate />,
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'test-cases', element: <TestCasesPage /> },
          { path: 'test-cases/new', element: <TestCaseFormPage mode="create" /> },
          { path: 'test-cases/similar', element: <SimilarCasesPage /> },
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
          { path: 'workshop', element: <WorkshopIndexPage /> },
          { path: 'workshop/:cycleId', element: <WorkshopPage /> },
          { path: 'evidence', element: <EvidencePage /> },
          { path: 'imports', element: <ImportsPage /> },
          { path: 'imports/:jobId', element: <ImportJobPage /> },
          { path: 'reports', element: <ReportsPage /> },
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
