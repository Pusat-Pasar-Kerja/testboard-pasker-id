import type { TFunction } from 'i18next'

/**
 * "Kelompok A · Meja 3", or just the name when it has no table number or already says it
 * ("Meja 3" at table 3 stays "Meja 3").
 */
export function groupLabel(
  t: TFunction,
  group: { name: string; table_number: number | null },
): string {
  const n = group.table_number
  if (!n || new RegExp(`(^|\\D)${n}(\\D|$)`).test(group.name)) return group.name
  return t('uat.groupWithTable', { name: group.name, number: n })
}

/** The route id of the "not in a Fase yet" folder. */
export const UNASSIGNED_PHASE = 'tanpa-fase'

/** "Bu Sri, sri@contoh.go.id" per line -> people (the e-mail is optional). */
export function parsePeople(text: string): { name: string; email: string | null }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,;\t]/).map((p) => p.trim())
      const email = parts.find((p) => p.includes('@')) ?? null
      const name = parts.filter((p) => p && p !== email).join(' ')
      return { name: name || (email ?? ''), email }
    })
}
