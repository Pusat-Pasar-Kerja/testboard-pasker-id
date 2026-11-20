import type {
  DefectPriority,
  DefectSeverity,
  DefectStatus,
  ExecutionStatus,
  RunStatus,
  TestCaseStatus,
} from '@testboard/shared'
import {
  Archive,
  Ban,
  BadgeCheck,
  CalendarClock,
  ChevronDown,
  ChevronsUp,
  ChevronUp,
  Circle,
  CircleCheck,
  CircleDot,
  CircleSlash,
  CircleX,
  Equal,
  Hammer,
  Info,
  LoaderCircle,
  Lock,
  PencilLine,
  Play,
  RotateCcw,
  SkipForward,
  CheckCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge, type Tone } from '../ui/Badge'

type Style = { tone: Tone; icon: LucideIcon }

const EXECUTION: Record<ExecutionStatus, Style> = {
  PASSED: { tone: 'success', icon: CircleCheck },
  FAILED: { tone: 'danger', icon: CircleX },
  BLOCKED: { tone: 'warning', icon: Ban },
  NOT_RUN: { tone: 'neutral', icon: Circle },
  IN_PROGRESS: { tone: 'info', icon: LoaderCircle },
  SKIPPED: { tone: 'muted', icon: SkipForward },
}

const DEFECT_STATUS: Record<DefectStatus, Style> = {
  OPEN: { tone: 'danger', icon: CircleDot },
  IN_PROGRESS: { tone: 'info', icon: Wrench },
  FIXED: { tone: 'warning', icon: Hammer },
  READY_FOR_RETEST: { tone: 'warning', icon: RotateCcw },
  VERIFIED: { tone: 'success', icon: BadgeCheck },
  REOPENED: { tone: 'danger', icon: RotateCcw },
  CLOSED: { tone: 'neutral', icon: CheckCheck },
  WONT_FIX: { tone: 'muted', icon: CircleSlash },
}

const SEVERITY: Record<DefectSeverity, Style> = {
  CRITICAL: { tone: 'danger', icon: ChevronsUp },
  HIGH: { tone: 'danger', icon: ChevronUp },
  MEDIUM: { tone: 'warning', icon: Equal },
  LOW: { tone: 'info', icon: ChevronDown },
  INFO: { tone: 'neutral', icon: Info },
}

const DEFECT_PRIORITY: Record<DefectPriority, Style> = {
  URGENT: { tone: 'danger', icon: ChevronsUp },
  HIGH: { tone: 'warning', icon: ChevronUp },
  MEDIUM: { tone: 'neutral', icon: Equal },
  LOW: { tone: 'muted', icon: ChevronDown },
}

const CASE_STATUS: Record<TestCaseStatus, Style> = {
  DRAFT: { tone: 'neutral', icon: PencilLine },
  READY: { tone: 'brand', icon: CircleCheck },
  ARCHIVED: { tone: 'muted', icon: Archive },
}

const RUN_STATUS: Record<RunStatus, Style> = {
  PLANNED: { tone: 'neutral', icon: CalendarClock },
  ACTIVE: { tone: 'info', icon: Play },
  COMPLETED: { tone: 'success', icon: CheckCheck },
  LOCKED: { tone: 'muted', icon: Lock },
}

export function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
  const { t } = useTranslation()
  return <Badge {...EXECUTION[status]} label={t(`codes.execution.${status}`)} />
}

export function DefectStatusBadge({ status }: { status: DefectStatus }) {
  const { t } = useTranslation()
  return <Badge {...DEFECT_STATUS[status]} label={t(`codes.defectStatus.${status}`)} />
}

export function SeverityBadge({ severity }: { severity: DefectSeverity }) {
  const { t } = useTranslation()
  return <Badge {...SEVERITY[severity]} label={t(`codes.severity.${severity}`)} />
}

export function DefectPriorityBadge({ priority }: { priority: DefectPriority }) {
  const { t } = useTranslation()
  return <Badge {...DEFECT_PRIORITY[priority]} label={t(`codes.defectPriority.${priority}`)} />
}

export function CaseStatusBadge({ status }: { status: TestCaseStatus }) {
  const { t } = useTranslation()
  return <Badge {...CASE_STATUS[status]} label={t(`codes.caseStatus.${status}`)} />
}

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const { t } = useTranslation()
  return <Badge {...RUN_STATUS[status]} label={t(`codes.runStatus.${status}`)} />
}
