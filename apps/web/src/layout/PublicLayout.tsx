import type { ReactNode } from 'react'
import { TestBoardLogo } from '../components/brand/TestBoardLogo'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

/** Soft pastel shapes behind the card (decoration only, hidden from assistive tech). */
function PastelBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-24 -left-20 size-72 rounded-full bg-pastel-lavender" />
      <div className="absolute top-1/3 -right-24 size-80 rounded-full bg-pastel-mint/80" />
      <div className="absolute -bottom-28 left-1/4 size-72 rounded-full bg-pastel-peach/80" />
      <div className="absolute top-16 right-1/4 size-24 rounded-full bg-pastel-butter" />
      <div className="absolute bottom-24 left-10 size-16 rounded-full bg-pastel-sky" />
    </div>
  )
}

/** Signed-out pages (login, account recovery, reset): one centred card with the logo. */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-canvas">
      <PastelBackdrop />
      <div className="relative flex justify-end p-4">
        <LanguageSwitcher />
      </div>
      <main className="relative flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md animate-page-in space-y-6 rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
          <TestBoardLogo size="lg" />
          {children}
        </div>
      </main>
    </div>
  )
}
