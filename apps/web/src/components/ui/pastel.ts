/** Pastel accent chips (decoration only; status meaning stays with the semantic colours). */
export const PASTELS = ['lavender', 'mint', 'peach', 'butter', 'sky'] as const
export type Pastel = (typeof PASTELS)[number]

export const PASTEL_CHIP: Record<Pastel, string> = {
  lavender: 'bg-pastel-lavender text-pastel-lavender-ink',
  mint: 'bg-pastel-mint text-pastel-mint-ink',
  peach: 'bg-pastel-peach text-pastel-peach-ink',
  butter: 'bg-pastel-butter text-pastel-butter-ink',
  sky: 'bg-pastel-sky text-pastel-sky-ink',
}

/** A stable pastel for a code (e.g. a project), so the same item keeps its colour. */
export function pastelFor(code: string): Pastel {
  let hash = 0
  for (const char of code) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PASTELS[hash % PASTELS.length] as Pastel
}
