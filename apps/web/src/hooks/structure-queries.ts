import { useQuery, type QueryClient } from '@tanstack/react-query'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'

/**
 * React Query hooks for the project laid out like Google Drive (ADR 0019): Fase > Fitur >
 * Skenario, the UATs of a project, and its Bug Reporting.
 */

const noRetryOnAuth = (failures: number, error: unknown) =>
  !(error instanceof ApiClientError && [401, 403, 404].includes(error.status)) && failures < 2

export function usePhaseTree(code: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['phase-tree', code],
    queryFn: () => ds.getPhaseTree(code),
    enabled: enabled && Boolean(code),
    retry: noRetryOnAuth,
  })
}

export function useUats(code: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['uats', code],
    queryFn: () => ds.listUats(code),
    enabled: enabled && Boolean(code),
    retry: noRetryOnAuth,
  })
}

export function useUat(code: string, uatId: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['uat', code, uatId],
    queryFn: () => ds.getUat(code, uatId),
    enabled: enabled && Boolean(uatId),
    retry: noRetryOnAuth,
  })
}

export function useUatParticipants(code: string, uatId: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['uat-participants', code, uatId],
    queryFn: () => ds.listUatParticipants(code, uatId),
    enabled,
    retry: noRetryOnAuth,
  })
}

export function useBugReporting(code: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['bug-reporting', code],
    queryFn: () => ds.getBugReporting(code),
    enabled,
    retry: noRetryOnAuth,
  })
}

/** Who works on each feature of a UAT: groups and people (ADR 0020). */
export function useUatAssignments(code: string, uatId: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['uat-assignments', code, uatId],
    queryFn: () => ds.listUatAssignments(code, uatId),
    enabled,
    retry: noRetryOnAuth,
  })
}

/** Reports from the public form waiting for an Admin (badge in the menu, review list). */
export function usePublicReports(code: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['public-reports', code],
    queryFn: () => ds.listPublicReports(code),
    enabled,
    refetchInterval: 60_000,
    retry: noRetryOnAuth,
  })
}

/**
 * After a change to a Fase, a feature folder, scenarios or a UAT: the tree, the UATs and
 * their boards, the scenario lists and the run pages can all be stale.
 */
export async function invalidateStructure(queryClient: QueryClient, code: string) {
  await Promise.all(
    [
      ['phase-tree', code],
      ['uats', code],
      ['uat', code],
      ['uat-participants', code],
      ['uat-assignments', code],
      ['workshop-board', code],
      ['workshop-tables', code],
      ['test-cases', code],
      ['cycles', code],
      ['modules', code],
      ['runs', code],
      ['run', code],
      ['dashboard', code],
      ['my-tasks'],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  )
}
