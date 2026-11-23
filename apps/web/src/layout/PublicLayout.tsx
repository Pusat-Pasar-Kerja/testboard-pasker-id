import type { ReactNode } from 'react'
import { PublicSiteLayout } from './PublicSiteLayout'

/**
 * Signed-out helper pages (account recovery, new password): one centred card inside the
 * same frame as the front page and the sign-in page.
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <PublicSiteLayout>
      <div className="mx-auto w-full max-w-lg animate-page-in space-y-6 rounded-[28px] card-pasker p-6 sm:p-10">
        {children}
      </div>
    </PublicSiteLayout>
  )
}
