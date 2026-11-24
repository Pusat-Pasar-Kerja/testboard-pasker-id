import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ApiClientError } from '../services/api-client'
import type { PublicBugQuery, PublicPreview, WorkshopBugQuery } from '../services/data-source'
import { useDataSource } from '../services/use-data-source'

/**
 * React Query hooks for Mode Workshop (ADR 0016) inside a UAT (ADR 0019): public pages,
 * group cards, facilitator.
 */

const noRetryOnAuth = (failures: number, error: unknown) =>
  !(error instanceof ApiClientError && [401, 403, 404].includes(error.status)) && failures < 2

export function usePublicUats() {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['public', 'uats'],
    queryFn: () => ds.listPublicUats(),
    refetchInterval: 60_000,
  })
}

export function usePublicUat(uatId: string, preview?: PublicPreview) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['public', 'uat', uatId, preview ?? null],
    queryFn: () => ds.getPublicUat(uatId, preview),
    retry: noRetryOnAuth,
    refetchInterval: 60_000,
  })
}

/** Projects whose Bug Reporting is public (front page). */
export function usePublicBugReportingList() {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['public', 'bug-reporting'],
    queryFn: () => ds.listPublicBugReporting(),
    refetchInterval: 60_000,
  })
}

export function usePublicBugReporting(projectCode: string, preview = false) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['public', 'bug-reporting', projectCode, preview],
    queryFn: () => ds.getPublicBugReporting(projectCode, preview),
    retry: noRetryOnAuth,
    refetchInterval: 60_000,
  })
}

export function usePublicBugs(
  projectCode: string,
  query: PublicBugQuery,
  enabled = true,
  preview = false,
) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['public', 'bugs', projectCode, query, preview],
    queryFn: () => ds.listPublicBugs(projectCode, query, preview),
    placeholderData: keepPreviousData,
    retry: noRetryOnAuth,
    enabled,
  })
}

export function useWorkshopSession(enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['workshop', 'session'],
    queryFn: () => ds.getWorkshopSession(),
    retry: noRetryOnAuth,
    enabled,
    refetchInterval: 30_000,
  })
}

export function useWorkshopCases(moduleId: string) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['workshop', 'cases', moduleId],
    queryFn: () => ds.listWorkshopCases(moduleId),
    retry: noRetryOnAuth,
  })
}

export function useWorkshopBugs(query: WorkshopBugQuery, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['workshop', 'bugs', query],
    queryFn: () => ds.listWorkshopBugs(query),
    placeholderData: keepPreviousData,
    retry: noRetryOnAuth,
    enabled,
  })
}

export function useWorkshopBoard(code: string, uatId: string, refetchMs = 15_000, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['workshop-board', code, uatId],
    queryFn: () => ds.getWorkshopBoard(code, uatId),
    refetchInterval: refetchMs,
    retry: noRetryOnAuth,
    enabled,
  })
}

export function useWorkshopTables(code: string, uatId: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['workshop-tables', code, uatId],
    queryFn: () => ds.listWorkshopTables(code, uatId),
    enabled,
    retry: noRetryOnAuth,
  })
}

export function useWorkshopInbox(code: string, uatId: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['workshop-inbox', code, uatId],
    queryFn: () => ds.listWorkshopInbox(code, uatId),
    enabled,
    refetchInterval: 20_000,
    retry: noRetryOnAuth,
  })
}
