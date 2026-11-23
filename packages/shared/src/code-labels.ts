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
      NOT_RUN: 'Belum dicoba',
      IN_PROGRESS: 'Sedang dicoba',
      PASSED: 'Sesuai',
      FAILED: 'Tidak sesuai',
      BLOCKED: 'Tidak bisa dicoba',
      SKIPPED: 'Dilewati',
    },
    en: {
      NOT_RUN: 'Not tried yet',
      IN_PROGRESS: 'Being tried',
      PASSED: 'As expected',
      FAILED: 'Not as expected',
      BLOCKED: 'Could not try',
      SKIPPED: 'Skipped',
    },
  } satisfies Record<Locale, Record<ExecutionStatus, string>>,
  executionKind: {
    id: { INITIAL: 'Percobaan pertama', RETEST: 'Uji ulang setelah perbaikan', RERUN: 'Diulang' },
    en: { INITIAL: 'First try', RETEST: 'Retest after a fix', RERUN: 'Repeated' },
  } satisfies Record<Locale, Record<ExecutionKind, string>>,
  defectStatus: {
    id: {
      OPEN: 'Baru dilaporkan',
      IN_PROGRESS: 'Sedang diperbaiki',
      FIXED: 'Sudah diperbaiki',
      READY_FOR_RETEST: 'Siap diuji ulang',
      VERIFIED: 'Sudah dicek beres',
      REOPENED: 'Muncul lagi',
      CLOSED: 'Selesai',
      WONT_FIX: 'Tidak diperbaiki',
    },
    en: {
      OPEN: 'Newly reported',
      IN_PROGRESS: 'Being fixed',
      FIXED: 'Fixed',
      READY_FOR_RETEST: 'Ready to retest',
      VERIFIED: 'Checked, all good',
      REOPENED: 'Came back',
      CLOSED: 'Done',
      WONT_FIX: "Won't be fixed",
    },
  } satisfies Record<Locale, Record<DefectStatus, string>>,
  severity: {
    id: { CRITICAL: 'Kritis', HIGH: 'Berat', MEDIUM: 'Sedang', LOW: 'Ringan', INFO: 'Info saja' },
    en: {
      CRITICAL: 'Critical',
      HIGH: 'Severe',
      MEDIUM: 'Moderate',
      LOW: 'Minor',
      INFO: 'Info only',
    },
  } satisfies Record<Locale, Record<DefectSeverity, string>>,
  defectPriority: {
    id: { URGENT: 'Segera', HIGH: 'Tinggi', MEDIUM: 'Sedang', LOW: 'Rendah' },
    en: { URGENT: 'Right away', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' },
  } satisfies Record<Locale, Record<DefectPriority, string>>,
  casePriority: {
    id: {
      MUST_HAVE: 'Wajib',
      SHOULD_HAVE: 'Penting',
      COULD_HAVE: 'Tambahan',
      WONT_HAVE: 'Tidak sekarang',
    },
    en: { MUST_HAVE: 'Must', SHOULD_HAVE: 'Important', COULD_HAVE: 'Extra', WONT_HAVE: 'Not now' },
  } satisfies Record<Locale, Record<TestCasePriority, string>>,
  testType: {
    id: {
      POSITIVE: 'Positif',
      NEGATIVE: 'Negatif',
      RBAC: 'Hak akses',
      SLA: 'Waktu layanan (SLA)',
      UI_UX: 'Tampilan (UI/UX)',
      INTEGRATION: 'Integrasi',
      OTHER: 'Lainnya',
    },
    en: {
      POSITIVE: 'Positive',
      NEGATIVE: 'Negative',
      RBAC: 'Access rights',
      SLA: 'Service time (SLA)',
      UI_UX: 'Look and feel (UI/UX)',
      INTEGRATION: 'Integration',
      OTHER: 'Other',
    },
  } satisfies Record<Locale, Record<TestType, string>>,
  caseStatus: {
    id: { DRAFT: 'Draf', READY: 'Siap diuji', ARCHIVED: 'Diarsipkan' },
    en: { DRAFT: 'Draft', READY: 'Ready to test', ARCHIVED: 'Archived' },
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
