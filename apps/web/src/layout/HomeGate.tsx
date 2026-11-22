import { Navigate } from 'react-router'
import { LoadingState } from '../components/ui/States'
import { useCurrentUser } from '../hooks/queries'
import { PublicHomePage } from '../pages/PublicHomePage'

/**
 * "/" for everyone: visitors see the public Fases (ADR 0016), signed-in staff go to their
 * projects, a table card goes straight to Mode Mudah.
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
  if (me.data?.account_kind === 'TABLE') return <Navigate to="/meja/kerja" replace />
  if (me.data) return <Navigate to="/projects" replace />
  return <PublicHomePage />
}
