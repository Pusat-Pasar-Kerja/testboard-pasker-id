import { FileQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export function NotFoundPage({
  reason = 'page',
  visitor = false,
}: {
  reason?: 'page' | 'project' | 'item'
  /** Signed out: the way back is the front page, not the project list. */
  visitor?: boolean
}) {
  const { t } = useTranslation()
  const body =
    reason === 'project'
      ? t('pages.notFound.project')
      : reason === 'item'
        ? t('pages.notFound.item')
        : t('pages.notFound.body')
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
      <FileQuestion aria-hidden="true" className="size-12 text-line-strong" />
      <h1 className="text-2xl font-bold text-brand-800">{t('pages.notFound.title')}</h1>
      <p className="max-w-md text-ink-muted">{body}</p>
      <Link
        to={visitor ? '/' : '/projects'}
        className="inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-4 font-semibold text-white hover:bg-brand-800"
      >
        {visitor ? t('public.home') : t('pages.notFound.home')}
      </Link>
    </div>
  )
}
