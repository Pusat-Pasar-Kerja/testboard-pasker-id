import type { TestCaseStepDto } from './dto.js'

/**
 * Display steps derived from the original step text, which is always preserved verbatim
 * (doc 02). Every line numbered "1." / "1)" -> one step per line; otherwise one step.
 */
export function stepsFromText(text: string | null | undefined): TestCaseStepDto[] {
  if (!text?.trim()) return []
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  const numbered = lines.every((line) => /^\s*\d+[.)]\s+/.test(line))
  if (!numbered) return [{ step_number: 1, instruction: text.trim(), expected_result: null }]
  return lines.map((line, index) => ({
    step_number: index + 1,
    instruction: line.replace(/^\s*\d+[.)]\s+/, '').trim(),
    expected_result: null,
  }))
}
