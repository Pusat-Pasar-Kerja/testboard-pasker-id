import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { DefectQuery, TestCaseQuery } from '../services/data-source'
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

export function useRun(code: string, id: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: ['run', code, id], queryFn: () => ds.getRun(code, id) })
}

export function useDefects(code: string, query: DefectQuery) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['defects', code, query],
    queryFn: () => ds.listDefects(code, query),
    placeholderData: keepPreviousData,
  })
}

export function useDefect(code: string, id: string) {
  const ds = useDataSource()
  return useQuery({ queryKey: ['defect', code, id], queryFn: () => ds.getDefect(code, id) })
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
