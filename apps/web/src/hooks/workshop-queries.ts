import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ApiClientError } from '../services/api-client'
import type { PublicBugQuery, PublicPreview, WorkshopBugQuery } from '../services/data-source'
import { useDataSource } from '../services/use-data-source'

/** React Query hooks for Mode Workshop (ADR 0016): public pages, table cards, facilitator. */

const noRetryOnAuth = (failures: number, error: unknown) =>
  !(error instanceof ApiClientError && [401, 403, 404].includes(error.status)) && failures < 2

export function usePublicCycles() {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['public', 'cycles'],
    queryFn: () => ds.listPublicCycles(),
    refetchInterval: 60_000,
  })
}

export function usePublicCycle(cycleId: string, preview?: PublicPreview) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['public', 'cycle', cycleId, preview ?? null],
    queryFn: () => ds.getPublicCycle(cycleId, preview),
    retry: noRetryOnAuth,
    refetchInterval: 60_000,
  })
}

export function usePublicBugs(
  cycleId: string,
  query: PublicBugQuery,
  enabled = true,
  preview?: PublicPreview,
) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['public', 'bugs', cycleId, query, preview ?? null],
    queryFn: () => ds.listPublicBugs(cycleId, query, preview),
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

export function useWorkshopBoard(code: string, cycleId: string, refetchMs = 15_000) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['workshop-board', code, cycleId],
    queryFn: () => ds.getWorkshopBoard(code, cycleId),
    refetchInterval: refetchMs,
    retry: noRetryOnAuth,
  })
}

export function useWorkshopTables(code: string, cycleId: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['workshop-tables', code, cycleId],
    queryFn: () => ds.listWorkshopTables(code, cycleId),
    enabled,
    retry: noRetryOnAuth,
  })
}

export function useWorkshopInbox(code: string, cycleId: string, enabled = true) {
  const ds = useDataSource()
  return useQuery({
    queryKey: ['workshop-inbox', code, cycleId],
    queryFn: () => ds.listWorkshopInbox(code, cycleId),
    enabled,
    refetchInterval: 20_000,
    retry: noRetryOnAuth,
  })
}
