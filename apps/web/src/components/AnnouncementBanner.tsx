import { Megaphone, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePublicSettings } from '../hooks/queries'

/** Website-wide announcement set by a Super Admin (site settings); dismissible per tab. */
function Banner({ text }: { text: string }) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('tb-dismissed-announcement') === text
    } catch {
      return false
    }
  })
  if (!text || dismissed) return null
  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b border-line bg-pastel-butter px-4 py-2 text-sm text-ink sm:px-6 lg:px-8"
    >
      <Megaphone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-pastel-butter-ink" />
      <p className="min-w-0 flex-1 whitespace-pre-line">
        <span className="sr-only">{t('shell.announcement')}: </span>
        {text}
      </p>
      <button
        type="button"
        onClick={() => {
          setDismissed(true)
          try {
            sessionStorage.setItem('tb-dismissed-announcement', text)
          } catch {
            // private mode: dismissed for this view only
          }
        }}
        className="-my-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-ink/5"
      >
        <X aria-hidden="true" className="size-4" />
        <span className="sr-only">{t('shell.dismiss')}</span>
      </button>
    </div>
  )
}

/**
 * The announcement on every page - app, public pages and the table screens (audit
 * 2026-11-24: the setting promises "semua halaman").
 */
export function AnnouncementBanner() {
  const settings = usePublicSettings()
  const text = settings.data?.['site.announcement'] ?? ''
  return <Banner key={text} text={text} />
}
