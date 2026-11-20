import type {
  DefectPriority,
  DefectSeverity,
  DefectStatus,
  ExecutionKind,
  ExecutionStatus,
  Locale,
  RunStatus,
  TestCasePriority,
  TestCaseStatus,
  TestType,
} from './enums.js'

/**
 * Human labels for codes in server-generated files (report exports). The web UI keeps its
 * own copies in i18n `codes.*`; a web unit test checks both stay identical.
 */
export const CODE_LABELS = {
  execution: {
    id: {
      NOT_RUN: 'Belum Diuji',
      IN_PROGRESS: 'Sedang Diuji',
      PASSED: 'Berhasil Diuji',
      FAILED: 'Gagal Diuji',
      BLOCKED: 'Terhambat',
      SKIPPED: 'Dilewati',
    },
    en: {
      NOT_RUN: 'Not Tested',
      IN_PROGRESS: 'In Progress',
      PASSED: 'Passed',
      FAILED: 'Failed',
      BLOCKED: 'Blocked',
      SKIPPED: 'Skipped',
    },
  } satisfies Record<Locale, Record<ExecutionStatus, string>>,
  executionKind: {
    id: { INITIAL: 'Awal', RETEST: 'Uji ulang', RERUN: 'Ulang' },
    en: { INITIAL: 'Initial', RETEST: 'Retest', RERUN: 'Rerun' },
  } satisfies Record<Locale, Record<ExecutionKind, string>>,
  defectStatus: {
    id: {
      OPEN: 'Terbuka',
      IN_PROGRESS: 'Sedang Diperbaiki',
      FIXED: 'Diperbaiki',
      READY_FOR_RETEST: 'Siap Diuji Ulang',
      VERIFIED: 'Terverifikasi',
      REOPENED: 'Dibuka Kembali',
      CLOSED: 'Ditutup',
      WONT_FIX: 'Tidak Akan Diperbaiki',
    },
    en: {
      OPEN: 'Open',
      IN_PROGRESS: 'In Progress',
      FIXED: 'Fixed',
      READY_FOR_RETEST: 'Ready for Retest',
      VERIFIED: 'Verified',
      REOPENED: 'Reopened',
      CLOSED: 'Closed',
      WONT_FIX: "Won't Fix",
    },
  } satisfies Record<Locale, Record<DefectStatus, string>>,
  severity: {
    id: { CRITICAL: 'Kritis', HIGH: 'Tinggi', MEDIUM: 'Sedang', LOW: 'Rendah', INFO: 'Informasi' },
    en: { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', INFO: 'Informational' },
  } satisfies Record<Locale, Record<DefectSeverity, string>>,
  defectPriority: {
    id: { URGENT: 'Mendesak', HIGH: 'Tinggi', MEDIUM: 'Sedang', LOW: 'Rendah' },
    en: { URGENT: 'Urgent', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' },
  } satisfies Record<Locale, Record<DefectPriority, string>>,
  casePriority: {
    id: {
      MUST_HAVE: 'Must Have',
      SHOULD_HAVE: 'Should Have',
      COULD_HAVE: 'Could Have',
      WONT_HAVE: "Won't Have",
    },
    en: {
      MUST_HAVE: 'Must Have',
      SHOULD_HAVE: 'Should Have',
      COULD_HAVE: 'Could Have',
      WONT_HAVE: "Won't Have",
    },
  } satisfies Record<Locale, Record<TestCasePriority, string>>,
  testType: {
    id: {
      POSITIVE: 'Positif',
      NEGATIVE: 'Negatif',
      RBAC: 'Hak Akses',
      SLA: 'SLA',
      UI_UX: 'UI/UX',
      INTEGRATION: 'Integrasi',
      OTHER: 'Lainnya',
    },
    en: {
      POSITIVE: 'Positive',
      NEGATIVE: 'Negative',
      RBAC: 'Access control',
      SLA: 'SLA',
      UI_UX: 'UI/UX',
      INTEGRATION: 'Integration',
      OTHER: 'Other',
    },
  } satisfies Record<Locale, Record<TestType, string>>,
  caseStatus: {
    id: { DRAFT: 'Draf', READY: 'Siap', ARCHIVED: 'Diarsipkan' },
    en: { DRAFT: 'Draft', READY: 'Ready', ARCHIVED: 'Archived' },
  } satisfies Record<Locale, Record<TestCaseStatus, string>>,
  runStatus: {
    id: { PLANNED: 'Direncanakan', ACTIVE: 'Berjalan', COMPLETED: 'Selesai', LOCKED: 'Dikunci' },
    en: { PLANNED: 'Planned', ACTIVE: 'Active', COMPLETED: 'Completed', LOCKED: 'Locked' },
  } satisfies Record<Locale, Record<RunStatus, string>>,
} as const

export type CodeGroup = keyof typeof CODE_LABELS

/** Label for a code; unknown codes are returned unchanged so data is never hidden. */
export function codeLabel(
  group: CodeGroup,
  code: string | null | undefined,
  locale: Locale,
): string {
  if (!code) return ''
  const labels = CODE_LABELS[group][locale] as Record<string, string>
  return labels[code] ?? code
}
