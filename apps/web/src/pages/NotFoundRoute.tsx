import { useCurrentUser } from '../hooks/queries'
import { AppShell } from '../layout/AppShell'
import { FirstLoad } from '../layout/FirstLoad'
import { PublicSiteLayout } from '../layout/PublicSiteLayout'
import { NotFoundPage } from './NotFoundPage'

/**
 * An address that does not exist: shown in the frame the reader is in. Visitors get the
 * public frame (not the sign-in page, audit 2026-11-24); signed-in people keep their menu.
 */
export function NotFoundRoute() {
  const me = useCurrentUser()
  if (me.isPending) return <FirstLoad />
  if (me.data && me.data.account_kind !== 'TABLE') {
    return (
      <AppShell>
        <NotFoundPage />
      </AppShell>
    )
  }
  return (
    <PublicSiteLayout>
      <NotFoundPage visitor />
    </PublicSiteLayout>
  )
}
