import type { ReactNode } from 'react'
import { TestBoardLogo } from '../components/brand/TestBoardLogo'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

/** Signed-out pages (login, account recovery, reset): one centred card with the logo. */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <div className="flex justify-end p-4">
        <LanguageSwitcher />
      </div>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md animate-page-in space-y-6 rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
          <TestBoardLogo size="lg" />
          {children}
        </div>
      </main>
    </div>
  )
}
