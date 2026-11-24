import { Navigate } from 'react-router'
import { LoadingState } from '../components/ui/States'
import { useCurrentUser } from '../hooks/queries'
import { homeOf } from '../lib/home'
import { PublicHomePage } from '../pages/PublicHomePage'

/**
 * "/" for everyone: visitors see the public pages (ADR 0016); a signed-in person goes to
 * their own start page (homeOf): projects, "Tugas saya", or Mode Mudah for a table card.
 */
export function HomeGate() {
  const me = useCurrentUser()
  if (me.isPending) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <LoadingState rows={4} />
      </div>
    )
  }
  if (me.data) return <Navigate to={homeOf(me.data)} replace />
  return <PublicHomePage />
}
