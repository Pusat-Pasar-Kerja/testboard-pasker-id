import type { ReportFilter } from '@testboard/shared'
import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query'
import type {
  AuditQuery,
  DefectQuery,
  FileQuery,
  ImportRowQuery,
  PageQuery,
  TestCaseQuery,
} from '../services/data-source'
import { useDataSource } from '../services/use-data-source'

/** React Query hooks over the DataSource seam (mock or http). */

/** null = not signed in (http mode). The mock always has a demo user. */
export function useCurrentUser() {
  const ds = useDataSource()
  return useQuery({ queryKey: ['me'], queryFn: () => ds.getCurrentUser(), staleTime: 60_000 })
}

export function useProjects() {
  const ds = useDataSource()
  return useQuery({ queryKey: ['projects'], queryFn: () => ds.listProjects() })
}

export function useProject(code: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: ['project', code], queryFn: () => ds.getProject(code) })
}

export function useModules(code: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: ['modules', code], queryFn: () => ds.listModules(code) })
}

export function useSuites(code: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: ['suites', code], queryFn: () => ds.listSuites(code) })
}

export function useMembers(code: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: ['members', code], queryFn: () => ds.listMembers(code) })
}

export function useDashboard(code: string, runId?: string) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['dashboard', code, runId ?? null],
    queryFn: () => ds.getDashboard(code, runId ? { run_id: runId } : {}),
    // Refetch keeps the frame: hold the previous render while a filter reloads.
    placeholderData: keepPreviousData,
  })
}

export function useTestCases(code: string, query: TestCaseQuery) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['test-cases', code, query],
    queryFn: () => ds.listTestCases(code, query),
    placeholderData: keepPreviousData,
  })
}

export function useTestCase(code: string, id: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['test-case', code, id],
    queryFn: () => ds.getTestCase(code, id),
    enabled,
  })
}

export function useRuns(code: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: ['runs', code], queryFn: () => ds.listRuns(code) })
}

export function useRun(code: string, id: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({ queryKey: ['run', code, id], queryFn: () => ds.getRun(code, id), enabled })
}

export function useCycles(code: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: ['cycles', code], queryFn: () => ds.listCycles(code) })
}

export function useRunCase(code: string, runCaseId: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['run-case', code, runCaseId],
    queryFn: () => ds.getRunCase(code, runCaseId),
    enabled,
  })
}

export function useDefects(code: string, query: DefectQuery, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['defects', code, query],
    queryFn: () => ds.listDefects(code, query),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useDefect(code: string, id: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['defect', code, id],
    queryFn: () => ds.getDefect(code, id),
    enabled,
  })
}

export function useAdminUsers(q: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['admin-users', q],
    queryFn: () => ds.listUsers(q || undefined),
    enabled,
    placeholderData: keepPreviousData,
  })
}

/**
 * After any run/execution change: the run, its list, run-case workspaces, dashboard
 * figures and cycle run counts can all be stale.
 */
export async function invalidateRunData(queryClient: QueryClient, code: string, runId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['run', code, runId] }),
    queryClient.invalidateQueries({ queryKey: ['runs', code] }),
    queryClient.invalidateQueries({ queryKey: ['run-case', code] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard', code] }),
    queryClient.invalidateQueries({ queryKey: ['cycles', code] }),
    queryClient.invalidateQueries({ queryKey: ['projects'] }),
  ])
}

/** After any bug change: lists, detail, dashboard figures and run/workspace bug links. */
export async function invalidateDefectData(queryClient: QueryClient, code: string) {
  await Promise.all(
    [
      ['defects', code],
      ['defect', code],
      ['dashboard', code],
      ['projects'],
      ['run-case', code],
      ['run', code],
      ['runs', code],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}

export function useFiles(code: string, query: FileQuery) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['files', code, query],
    queryFn: () => ds.listFiles(code, query),
    placeholderData: keepPreviousData,
  })
}

export function useReportOverview(code: string, filter: ReportFilter) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['report-overview', code, filter],
    queryFn: () => ds.getReportOverview(code, filter),
    placeholderData: keepPreviousData,
  })
}

export function useAuditLogs(code: string, query: AuditQuery, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['audit-logs', code, query],
    queryFn: () => ds.listAuditLogs(code, query),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useImports(code: string, query: PageQuery) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['imports', code, query],
    queryFn: () => ds.listImports(code, query),
    placeholderData: keepPreviousData,
  })
}

/** Polls while the import is being applied in the background. */
export function useImport(code: string, id: string) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['import', code, id],
    queryFn: () => ds.getImport(code, id),
    refetchInterval: (query) => (query.state.data?.status_code === 'IMPORTING' ? 1000 : false),
  })
}

export function useImportRows(code: string, id: string, query: ImportRowQuery, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['import-rows', code, id, query],
    queryFn: () => ds.listImportRows(code, id, query),
    placeholderData: keepPreviousData,
    enabled,
  })
}
