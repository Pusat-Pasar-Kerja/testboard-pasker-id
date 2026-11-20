import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation } from 'react-router'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useCurrentUser } from '../hooks/queries'
import { storeLocale } from '../i18n'

/**
 * Sends anonymous visitors to /login (keeping where they wanted to go). UX only - the API
 * rejects every unauthenticated request anyway.
 * After sign-in the profile language (users.preferred_locale) is authoritative (doc 10).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useCurrentUser()
  const location = useLocation()
  const { i18n } = useTranslation()
  const appliedFor = useRef<string | null>(null)

  const user = me.data
  useEffect(() => {
    if (!user || appliedFor.current === user.id) return
    appliedFor.current = user.id
    if (i18n.resolvedLanguage !== user.preferred_locale) {
      void i18n.changeLanguage(user.preferred_locale)
      storeLocale(user.preferred_locale)
    }
  }, [user, i18n])

  if (me.isPending) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <LoadingState rows={4} />
      </div>
    )
  }
  if (me.isError) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />
  if (!user) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return children
}
