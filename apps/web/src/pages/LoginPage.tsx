import { FlaskConical, LogIn } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { TestBoardLogo } from '../components/brand/TestBoardLogo'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useCurrentUser } from '../hooks/queries'

/**
 * DEMO-only entry screen. Deliberately has NO password field: real authentication
 * (Argon2id, HttpOnly session cookie, CSRF) is built in Milestone 2.
 */
export function LoginPage() {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const role = me.data?.projects[0]?.role_code

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <div className="flex justify-end p-4">
        <LanguageSwitcher />
      </div>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
          <TestBoardLogo size="lg" />
          <div className="space-y-2">
            <h1 className="text-xl font-bold">{t('pages.login.title')}</h1>
            <p className="text-sm text-ink-muted">{t('app.tagline')}</p>
          </div>
          <p className="flex gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
            <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{t('pages.login.demoNotice')}</span>
          </p>
          {me.data && role && (
            <p className="text-sm text-ink-muted">
              {t('pages.login.demoUser', {
                name: me.data.display_name,
                role: t(`codes.role.${role}`),
              })}
            </p>
          )}
          <Link
            to="/projects"
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 font-semibold text-white hover:bg-brand-800"
          >
            <LogIn aria-hidden="true" className="size-4" />
            {t('actions.signInDemo')}
          </Link>
        </div>
      </main>
    </div>
  )
}
