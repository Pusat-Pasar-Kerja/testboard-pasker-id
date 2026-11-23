import { useTranslation } from 'react-i18next'
import { TestBoardMark } from '../components/brand/TestBoardMark'

/** Shown while the first page of a visit is still downloading: calm, branded, one place. */
export function FirstLoad() {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 p-8 text-ink-muted"
    >
      <TestBoardMark className="size-14 animate-soft-pulse text-brand-mark" />
      <span className="text-sm font-medium">{t('states.loadingPage')}</span>
    </div>
  )
}
