import { TestBoardMark } from './TestBoardMark'

/*
 * Proportions measured from the hub logos (Karirhub/Skillhub/Maganghub):
 * symbol height ~1.4x the wordmark font size, endorsement line ~0.3x, gap ~0.25x.
 */
const SIZES = {
  sm: { mark: 'size-[25px]', word: 'text-[18px]', tagline: 'text-[6.5px]', gap: 'gap-1' },
  md: { mark: 'size-[33px]', word: 'text-[24px]', tagline: 'text-[7.5px]', gap: 'gap-1.5' },
  lg: { mark: 'size-[56px]', word: 'text-[40px]', tagline: 'text-[11px]', gap: 'gap-2.5' },
} as const

/**
 * Logo lockup, aligned with the hub family: mark + "Test" (Inter ExtraBold) + "Board"
 * (Inter Light) in Kemnaker navy, with a small grey endorsement line right-aligned under it
 * (hubs use "oleh Kemnaker"). The lockup is a fixed brand asset, not translated.
 * tone="light" is the white version for the navy footer and the welcome panel.
 */
export function TestBoardLogo({
  size = 'md',
  showTagline = true,
  tone = 'default',
  className = '',
}: {
  size?: keyof typeof SIZES
  showTagline?: boolean
  tone?: 'default' | 'light'
  className?: string
}) {
  const s = SIZES[size]
  const light = tone === 'light'
  return (
    <span className={`inline-flex items-center ${s.gap} ${className}`}>
      <TestBoardMark className={`${s.mark} shrink-0 ${light ? 'text-white' : 'text-brand-mark'}`} />
      <span className="inline-flex flex-col leading-none">
        <span
          className={`${s.word} tracking-[-0.035em] whitespace-nowrap ${light ? 'text-white' : 'text-logo-ink'}`}
        >
          <span className="font-extrabold">Test</span>
          <span className="font-light">Board</span>
        </span>
        {showTagline && (
          <span
            className={`${s.tagline} mt-[0.25em] self-end font-semibold whitespace-nowrap ${light ? 'text-white/75' : 'text-logo-muted'}`}
          >
            oleh PASKER ID
          </span>
        )}
      </span>
    </span>
  )
}
