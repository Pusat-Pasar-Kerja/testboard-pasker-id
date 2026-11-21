import { z } from 'zod'
import type { IdString } from './api.js'
import type { TestCaseStatus } from './enums.js'

/**
 * Finding test cases that are probably the same check written twice (ADR 0013), e.g. the
 * short Phase 2 sheet and its long hidden version, which reuse codes for different cases.
 * Codes are therefore ignored: the score compares title words, expected-result words and
 * the requirement references written in brackets ("[FSD-LPL-001/002] ...").
 */
const STOP_WORDS = new Set([
  'dan',
  'yang',
  'pada',
  'dengan',
  'untuk',
  'dari',
  'tidak',
  'atau',
  'ke',
  'di',
  'ini',
  'itu',
  'oleh',
  'dalam',
  'sebagai',
  'akan',
  'dapat',
  'bisa',
  'sudah',
  'belum',
  'jika',
  'saat',
  'harus',
  'juga',
  'agar',
  'telah',
  'serta',
  'the',
  'and',
  'of',
  'to',
  'in',
  'is',
  'for',
  'on',
])

/** Words of a text without bracketed references, lower-cased, 3+ letters, no stop words. */
export function wordTokens(text: string | null | undefined): Set<string> {
  const plain = (text ?? '').replace(/\[[^\]]*\]/g, ' ').toLowerCase()
  return new Set(
    plain.split(/[^\p{L}\p{N}_]+/u).filter((word) => word.length >= 3 && !STOP_WORDS.has(word)),
  )
}

/**
 * Requirement references in brackets: "[FSD-LPL-001/002/030]" -> FSD-LPL-001, FSD-LPL-002,
 * FSD-LPL-030; "[UAT-PKI-02 / UAT-PKI-75]" -> UAT-PKI-02, UAT-PKI-75.
 */
export function referenceTokens(text: string | null | undefined): string[] {
  const out = new Set<string>()
  for (const [, inside] of (text ?? '').matchAll(/\[([^\]]+)\]/g)) {
    let prefix = ''
    for (const part of (inside ?? '').split(/[\s/,;]+/).filter(Boolean)) {
      const full = /^([A-Za-z]+(?:-[A-Za-z]+)*)-(\d+[A-Za-z]?)$/.exec(part)
      if (full) {
        prefix = full[1]!.toUpperCase()
        out.add(`${prefix}-${full[2]!.toUpperCase()}`)
      } else if (/^\d+[A-Za-z]?$/.test(part) && prefix) {
        out.add(`${prefix}-${part.toUpperCase()}`)
      }
    }
  }
  return [...out]
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const word of a) if (b.has(word)) shared += 1
  return shared / (a.size + b.size - shared)
}

export interface SimilarityInput {
  id: IdString
  title: string
  expected_result: string | null
}

export type SimilarityReason = 'TITLE' | 'EXPECTED' | 'REFERENCE'

export interface SimilarityScore {
  /** 0..1 */
  score: number
  reasons: SimilarityReason[]
  shared_refs: string[]
}

/** Prepared tokens, so a whole library can be compared without re-tokenising. */
export interface PreparedCase {
  title: Set<string>
  expected: Set<string>
  refs: Set<string>
}

export function prepareCase(c: Pick<SimilarityInput, 'title' | 'expected_result'>): PreparedCase {
  return {
    title: wordTokens(c.title),
    expected: wordTokens(c.expected_result),
    refs: new Set(referenceTokens(c.title)),
  }
}

export function compareCases(a: PreparedCase, b: PreparedCase): SimilarityScore {
  const title = jaccard(a.title, b.title)
  const expected = jaccard(a.expected, b.expected)
  const sharedRefs = [...a.refs].filter((ref) => b.refs.has(ref))
  const score = Math.min(1, 0.6 * title + 0.3 * expected + (sharedRefs.length > 0 ? 0.1 : 0))
  const reasons: SimilarityReason[] = []
  if (title >= 0.6) reasons.push('TITLE')
  if (expected >= 0.6) reasons.push('EXPECTED')
  if (sharedRefs.length > 0) reasons.push('REFERENCE')
  return { score, reasons, shared_refs: sharedRefs.sort() }
}

export const SIMILARITY_THRESHOLD = 0.45
export const SIMILAR_PAIRS_LIMIT = 200

/** Most similar pairs first; each pair once. */
export function findSimilarPairs<T extends SimilarityInput>(
  cases: T[],
  options: { threshold?: number; limit?: number } = {},
): { a: T; b: T; similarity: SimilarityScore }[] {
  const threshold = options.threshold ?? SIMILARITY_THRESHOLD
  const prepared = cases.map(prepareCase)
  const pairs: { a: T; b: T; similarity: SimilarityScore }[] = []
  for (let i = 0; i < cases.length; i += 1) {
    for (let j = i + 1; j < cases.length; j += 1) {
      const similarity = compareCases(prepared[i]!, prepared[j]!)
      if (similarity.score >= threshold) pairs.push({ a: cases[i]!, b: cases[j]!, similarity })
    }
  }
  return pairs
    .sort((x, y) => y.similarity.score - x.similarity.score)
    .slice(0, options.limit ?? SIMILAR_PAIRS_LIMIT)
}

export interface SimilarCaseSide {
  id: IdString
  case_code: string
  title: string
  expected_result: string | null
  module_code: string | null
  case_status: TestCaseStatus
}

export interface SimilarCasePair extends SimilarityScore {
  a: SimilarCaseSide
  b: SimilarCaseSide
}

const idString = z.string().regex(/^\d{1,20}$/)

/** Keep `target_id`; every source is archived and points to it (merged_into). */
export const testCaseMergeSchema = z
  .object({
    target_id: idString,
    source_ids: z.array(idString).min(1).max(20),
  })
  .refine((v) => !v.source_ids.includes(v.target_id), {
    path: ['source_ids'],
    message: 'The kept test case cannot also be merged away',
  })
export type TestCaseMergeInput = z.input<typeof testCaseMergeSchema>

export interface TestCaseMergeResult {
  target: { id: IdString; case_code: string }
  merged: { id: IdString; case_code: string }[]
}
