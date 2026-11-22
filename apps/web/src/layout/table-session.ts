import type { WorkshopSessionDto } from '@testboard/shared'
import { createContext, useContext } from 'react'

export const SessionContext = createContext<WorkshopSessionDto | null>(null)

/** The table (meja) signed in on this device; only inside <EasyLayout>. */
export function useTableSession(): WorkshopSessionDto {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useTableSession outside EasyLayout')
  return session
}
