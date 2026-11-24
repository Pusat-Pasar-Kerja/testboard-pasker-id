import type { PhaseDto, UatSummaryDto } from '@testboard/shared'
import {
  Bug,
  ChartColumn,
  ChevronDown,
  ChevronLeft,
  ClipboardCheck,
  FileUp,
  FlaskConical,
  Folder,
  FolderCog,
  FolderInput,
  FolderKanban,
  FolderOpen,
  History,
  Images,
  KeyRound,
  LayoutDashboard,
  Plus,
  Settings2,
  SlidersHorizontal,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useLocation, useParams } from 'react-router'
import { isFeatureDrag, readFeatureDrag, type FeatureDrag } from '../components/phase/feature-drag'
import { FeatureTransferDialog } from '../components/phase/FeatureTransferDialog'
import { NO_PHASE } from '../components/phase/PhasePicker'
import { useCan } from '../hooks/permissions'
import { useCurrentUser, useProject, useProjects, useRecoverySummary } from '../hooks/queries'
import { projectPath } from '../hooks/route-state'
import { usePhaseTree, usePublicReports, useUats } from '../hooks/structure-queries'
import { groupLabel } from '../lib/uat'

/** Website administration (ADR 0011, 0017): an Admin sees the projects page only. */
const ADMIN_ITEMS = [
  { key: 'adminProjects', path: '/admin/projects', icon: FolderCog },
  { key: 'adminUsersShort', path: '/admin/users', icon: UsersRound },
  { key: 'adminRecovery', path: '/admin/recovery', icon: KeyRound },
  { key: 'adminSettings', path: '/admin/settings', icon: Settings2 },
  { key: 'adminAudit', path: '/admin/audit', icon: History },
] as const

/** Project tools for the people who manage it, below the Drive-like tree. */
const MANAGE_ITEMS: {
  key: 'imports' | 'evidence' | 'reports' | 'members' | 'settings'
  path: string
  icon: LucideIcon
}[] = [
  { key: 'imports', path: 'imports', icon: FileUp },
  { key: 'evidence', path: 'evidence', icon: Images },
  { key: 'reports', path: 'reports', icon: ChartColumn },
  { key: 'members', path: 'members', icon: Users },
  { key: 'settings', path: 'settings', icon: SlidersHorizontal },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center gap-3 rounded-xl px-3 py-1.5 text-sm transition-colors ${
    isActive
      ? 'bg-brand-50 font-semibold text-brand-800 shadow-[inset_3px_0_0_var(--color-brand-600)]'
      : 'text-ink hover:bg-brand-50/60'
  }`

/** A row inside the tree (Fase folders, feature folders, UATs): one size everywhere. */
const childClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-10 items-center gap-2.5 rounded-lg px-2 py-1 text-sm transition-colors ${
    isActive ? 'bg-brand-50 font-semibold text-brand-800' : 'text-ink hover:bg-brand-50/60'
  }`

function GroupTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <div className="mt-5 mb-1 flex min-h-8 items-center justify-between gap-2 px-3">
      <p className="text-[11px] font-semibold tracking-wider text-ink-muted uppercase">
        {children}
      </p>
      {action}
    </div>
  )
}

/** "+" next to a group title (new Fase, new UAT). */
function AddLink({
  to,
  label,
  onNavigate,
}: {
  to: string
  label: string
  onNavigate?: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-label={label}
      title={label}
      className="inline-flex size-8 items-center justify-center rounded-lg text-brand-700 hover:bg-brand-50"
    >
      <Plus aria-hidden="true" className="size-4" />
    </Link>
  )
}

function Count({ value, label }: { value: number; label?: string }) {
  return (
    <span className="ml-auto shrink-0 rounded-full bg-neutral-soft px-1.5 text-xs text-ink-muted tabular-nums">
      {value}
      {label && <span className="sr-only"> {label}</span>}
    </span>
  )
}

function PanelHeader({
  back,
  backLabel,
  eyebrow,
  title,
  note,
  onNavigate,
}: {
  back?: string
  backLabel?: string
  eyebrow: string
  title: string
  note?: string | null
  onNavigate?: () => void
}) {
  return (
    <div className="mb-3 space-y-2">
      {back && backLabel && (
        <Link
          to={back}
          onClick={onNavigate}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {backLabel}
        </Link>
      )}
      <div className="rounded-xl bg-gradient-to-br from-brand-50 to-teal-50 px-3 py-2 ring-1 ring-brand-100">
        <p className="text-[11px] font-semibold tracking-wider text-teal-700 uppercase">
          {eyebrow}
        </p>
        <p className="truncate font-semibold text-brand-800">{title}</p>
        {note && <p className="text-xs text-ink-muted">{note}</p>}
      </div>
    </div>
  )
}

/** Outside a project: my work and every project, like the top level of Google Drive. */
function HomeNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const projects = useProjects()
  const list = projects.data ?? []
  return (
    <>
      <ul className="space-y-1">
        <li>
          <NavLink to="/tugas" className={linkClass} onClick={onNavigate} data-tour="my-tasks">
            <ClipboardCheck aria-hidden="true" className="size-5 shrink-0" />
            <span>{t('nav.myTasks')}</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/projects" end className={linkClass} onClick={onNavigate}>
            <FolderKanban aria-hidden="true" className="size-5 shrink-0" />
            <span>{t('nav.projects')}</span>
          </NavLink>
        </li>
      </ul>
      {list.length > 0 && (
        <>
          <GroupTitle>{t('nav.projectList')}</GroupTitle>
          <ul className="space-y-0.5" data-tour="project-menu">
            {list.slice(0, 15).map((p) => (
              <li key={p.id}>
                <NavLink
                  to={projectPath(p.project_code)}
                  className={linkClass}
                  onClick={onNavigate}
                >
                  <Folder aria-hidden="true" className="size-5 shrink-0 text-brand-600" />
                  <span className="min-w-0 flex-1 truncate" title={p.name}>
                    {p.name}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

/**
 * The children of a section row ("Semua Fase", "Semua UAT") hang under the section's icon,
 * the same way in every section (owner, 2026-11-24: everything symmetric).
 */
const TREE = 'ml-[1.375rem] space-y-0.5 border-l border-line pl-2'

/** Feature folders inside a Fase folder: one more step in, kept narrow so names fit. */
const NESTED = 'ml-4 space-y-0.5 border-l border-line pl-1.5'

/** The right-hand slot of a child row: same width for a folder toggle and a status dot. */
const SLOT = 'inline-flex size-8 shrink-0 items-center justify-center rounded-lg'

/**
 * One Fase folder: opens like a folder in Google Drive and shows its feature folders. Feature
 * folders can be dropped on it to move or copy them here (ADR 0020).
 */
function PhaseFolder({
  code,
  phase,
  open,
  onToggle,
  onNavigate,
  onDropFeatures,
}: {
  code: string
  phase: PhaseDto
  open: boolean
  onToggle: () => void
  onNavigate?: () => void
  onDropFeatures: (drag: FeatureDrag, target: string) => void
}) {
  const { t } = useTranslation()
  const [over, setOver] = useState(false)
  const base = phase.id ? `fase/${phase.id}` : 'fase/tanpa-fase'
  const name = phase.id ? (phase.title ?? '') : t('phases.unassigned')
  const target = phase.id ?? NO_PHASE
  const listId = `phase-${phase.id ?? 'none'}-features`
  return (
    <li>
      <div
        onDragOver={(event) => {
          if (!isFeatureDrag(event)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          setOver(false)
          const drag = readFeatureDrag(event)
          if (!drag) return
          event.preventDefault()
          if ((drag.from ?? NO_PHASE) !== target) onDropFeatures(drag, target)
        }}
        className={`flex items-center gap-1 rounded-lg ${
          over ? 'bg-brand-50 ring-2 ring-brand-500' : ''
        }`}
      >
        <NavLink
          to={projectPath(code, base)}
          end
          className={(state) => `${childClass(state)} min-w-0 flex-1`}
          onClick={onNavigate}
        >
          {phase.id ? (
            open ? (
              <FolderOpen aria-hidden="true" className="size-4 shrink-0 text-brand-600" />
            ) : (
              <Folder aria-hidden="true" className="size-4 shrink-0 text-brand-600" />
            )
          ) : (
            <FolderInput aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
          )}
          <span className="min-w-0 flex-1 truncate" title={name}>
            {name}
          </span>
          <Count value={phase.scenarios} label={t('nav.scenarioCount')} />
        </NavLink>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={listId}
          aria-label={t(open ? 'nav.collapse' : 'nav.expand', { name })}
          className={`${SLOT} text-ink-muted hover:bg-brand-50`}
        >
          <ChevronDown
            aria-hidden="true"
            className={`size-4 transition-transform ${open ? '' : '-rotate-90'}`}
          />
        </button>
      </div>
      {over && <p className="sr-only">{t('phases.transfer.dropHere', { name })}</p>}
      {open && (
        <ul id={listId} aria-label={t('nav.featuresOf', { name })} className={`${NESTED} mt-0.5`}>
          {phase.features.length === 0 && (
            <li className="px-2 py-1 text-xs text-ink-muted">{t('nav.noFeatures')}</li>
          )}
          {phase.features.map((feature) => (
            <li key={feature.module.id} className="flex items-center gap-1">
              <NavLink
                to={projectPath(code, `${base}/fitur/${feature.module.id}`)}
                className={(state) => `${childClass(state)} min-w-0 flex-1`}
                onClick={onNavigate}
              >
                <Folder aria-hidden="true" className="size-4 shrink-0 text-teal-600" />
                <span className="min-w-0 flex-1 truncate" title={feature.module.name}>
                  {feature.module.name}
                </span>
                <Count value={feature.scenarios} label={t('nav.scenarioCount')} />
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function UatLink({
  code,
  uat,
  onNavigate,
}: {
  code: string
  uat: UatSummaryDto
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const dot =
    uat.status_code === 'ACTIVE'
      ? 'bg-success'
      : uat.status_code === 'PLANNED'
        ? 'bg-info'
        : 'bg-line-strong'
  return (
    <li className="flex items-center gap-1">
      <NavLink
        to={projectPath(code, `uat/${uat.id}`)}
        className={(state) => `${childClass(state)} min-w-0 flex-1`}
        onClick={onNavigate}
      >
        <FlaskConical aria-hidden="true" className="size-4 shrink-0 text-brand-600" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate" title={uat.name}>
            {uat.name}
          </span>
          <span className="block truncate text-[11px] font-normal text-ink-muted">
            {uat.my_group ? groupLabel(t, uat.my_group) : (uat.phase?.title ?? '')}
          </span>
        </span>
        <span className="sr-only">{t(`codes.runStatus.${uat.status_code}`)}</span>
      </NavLink>
      <span aria-hidden="true" className={SLOT}>
        <span className={`size-2.5 rounded-full ${dot}`} />
      </span>
    </li>
  )
}

/**
 * Inside a project, laid out like Google Drive (owner, 2026-11-24): Ringkasan, the Fase
 * folders with their feature folders, the UATs, Bug Reporting, and the tools to manage the
 * project. A Pengguna sees their own UATs and Bug Reporting (ADR 0019).
 */
function ProjectNav({ projectCode, onNavigate }: { projectCode: string; onNavigate?: () => void }) {
  const { t } = useTranslation()
  const { cycleId } = useParams()
  const project = useProject(projectCode)
  const can = useCan(projectCode)
  const manager = can('run.write')
  const tree = usePhaseTree(projectCode, manager)
  const uats = useUats(projectCode)
  const reports = usePublicReports(projectCode, manager)
  const waiting = reports.data?.length ?? 0
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const [dropped, setDropped] = useState<{ drag: FeatureDrag; target: string } | null>(null)
  const current = cycleId === 'tanpa-fase' ? 'none' : cycleId
  const isOpen = (id: string) => toggled[id] ?? id === current
  const phases = [
    ...(tree.data?.phases ?? []),
    ...(tree.data && tree.data.unassigned.scenarios > 0 ? [tree.data.unassigned] : []),
  ]
  return (
    <div data-tour="project-menu">
      <PanelHeader
        back="/projects"
        backLabel={t('nav.projects')}
        eyebrow={t('nav.thisProject')}
        title={project.data?.name ?? projectCode}
        note={project.data && !manager ? t('nav.youArePengguna') : null}
        onNavigate={onNavigate}
      />
      <ul className="space-y-0.5" data-tour="home">
        <li>
          <NavLink to={projectPath(projectCode)} className={linkClass} onClick={onNavigate}>
            <LayoutDashboard aria-hidden="true" className="size-5 shrink-0" />
            <span>{t('nav.dashboard')}</span>
          </NavLink>
        </li>
      </ul>

      {manager && (
        <div data-tour="group-phases">
          <GroupTitle
            action={
              <AddLink
                to={`${projectPath(projectCode, 'fase')}?baru=1`}
                label={t('phases.new')}
                onNavigate={onNavigate}
              />
            }
          >
            {t('nav.phases')}
          </GroupTitle>
          <NavLink
            to={projectPath(projectCode, 'fase')}
            end
            className={linkClass}
            onClick={onNavigate}
          >
            <FolderKanban aria-hidden="true" className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{t('nav.allPhases')}</span>
            {tree.data && <Count value={tree.data.phases.length} label={t('nav.phaseCount')} />}
          </NavLink>
          {phases.length > 0 && (
            <ul className={`${TREE} mt-0.5`} aria-label={t('nav.phaseFolders')}>
              {phases.map((phase) => {
                const id = phase.id ?? 'none'
                return (
                  <PhaseFolder
                    key={id}
                    code={projectCode}
                    phase={phase}
                    open={isOpen(id)}
                    onToggle={() => setToggled((prev) => ({ ...prev, [id]: !isOpen(id) }))}
                    onNavigate={onNavigate}
                    onDropFeatures={(drag, target) => setDropped({ drag, target })}
                  />
                )
              })}
            </ul>
          )}
        </div>
      )}

      <div data-tour="group-uat">
        <GroupTitle
          action={
            manager ? (
              <AddLink
                to={projectPath(projectCode, 'uat/baru')}
                label={t('uat.new')}
                onNavigate={onNavigate}
              />
            ) : undefined
          }
        >
          {manager ? t('nav.uat') : t('nav.myUat')}
        </GroupTitle>
        <NavLink
          to={projectPath(projectCode, 'uat')}
          end
          className={linkClass}
          onClick={onNavigate}
        >
          <FlaskConical aria-hidden="true" className="size-5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {manager ? t('nav.allUats') : t('nav.myUat')}
          </span>
          {uats.data && <Count value={uats.data.length} label={t('nav.uatCount')} />}
        </NavLink>
        {(uats.data?.length ?? 0) > 0 && (
          <ul className={`${TREE} mt-0.5`} aria-label={t('nav.uatList')}>
            {(uats.data ?? []).slice(0, 12).map((uat) => (
              <UatLink key={uat.id} code={projectCode} uat={uat} onNavigate={onNavigate} />
            ))}
          </ul>
        )}
      </div>

      <div data-tour="group-bugs">
        <GroupTitle>{t('nav.bugReporting')}</GroupTitle>
        <NavLink to={projectPath(projectCode, 'bugs')} className={linkClass} onClick={onNavigate}>
          <Bug aria-hidden="true" className="size-5 shrink-0" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate">{t('nav.bugReporting')}</span>
            <span className="block truncate text-[11px] font-normal text-ink-muted">
              {t('nav.term.bugReporting')}
            </span>
          </span>
          {waiting > 0 && (
            <span className="ml-auto rounded-full bg-danger px-1.5 text-xs font-semibold text-white tabular-nums">
              {waiting}
              <span className="sr-only"> {t('nav.waitingReports')}</span>
            </span>
          )}
        </NavLink>
      </div>

      {manager && (
        <div data-tour="group-manage">
          <GroupTitle>{t('nav.group.manage')}</GroupTitle>
          <ul className="space-y-0.5">
            {MANAGE_ITEMS.map((item) => (
              <li key={item.key}>
                <NavLink
                  to={projectPath(projectCode, item.path)}
                  className={linkClass}
                  onClick={onNavigate}
                >
                  <item.icon aria-hidden="true" className="size-5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{t(`nav.${item.key}`)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      )}
      {dropped && (
        <FeatureTransferDialog
          code={projectCode}
          from={dropped.drag.from}
          features={dropped.drag.features}
          initialTarget={dropped.target}
          initialMode="move"
          onClose={() => setDropped(null)}
        />
      )}
    </div>
  )
}

/** The website administration has its own panel (ADR 0011, 0017). */
function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const siteRole = me.data?.system_role ?? null
  // New "Lupa kata sandi / email" requests: shown as a badge (no e-mail is sent).
  const recoverySummary = useRecoverySummary(siteRole === 'SUPER_ADMIN')
  const openRequests = recoverySummary.data?.open_requests ?? 0
  return (
    <>
      <PanelHeader
        back="/projects"
        backLabel={t('nav.projects')}
        eyebrow={t('nav.adminEyebrow')}
        title={t('nav.adminSection')}
        note={siteRole ? t(`codes.systemRole.${siteRole}`) : null}
        onNavigate={onNavigate}
      />
      <ul className="space-y-0.5">
        {ADMIN_ITEMS.filter(
          (item) => siteRole === 'SUPER_ADMIN' || item.key === 'adminProjects',
        ).map((item) => (
          <li key={item.key}>
            <NavLink to={item.path} className={linkClass} onClick={onNavigate}>
              <item.icon aria-hidden="true" className="size-5 shrink-0" />
              <span>{t(`nav.${item.key}`)}</span>
              {item.key === 'adminRecovery' && openRequests > 0 && (
                <span className="ml-auto rounded-full bg-danger px-1.5 text-xs font-semibold text-white tabular-nums">
                  {openRequests}
                  <span className="sr-only"> {t('nav.openRequests')}</span>
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * The left panel (owner, 2026-11-24: like Google Drive, one thing at a time): the project's
 * contents inside a project, the administration under /admin, otherwise my work and the
 * list of projects. Help, accessibility, administration and the account live in the top bar.
 */
export function SidebarNav({
  projectCode,
  onNavigate,
}: {
  projectCode?: string
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const me = useCurrentUser()
  // Only Admins and Super Admins get the administration panel; anyone else sees home.
  const admin = pathname.startsWith('/admin') && Boolean(me.data?.system_role)
  return (
    <nav aria-label={t('nav.main')} className="h-full overflow-y-auto px-3 py-4">
      {admin ? (
        <AdminNav onNavigate={onNavigate} />
      ) : projectCode ? (
        <ProjectNav projectCode={projectCode} onNavigate={onNavigate} />
      ) : (
        <HomeNav onNavigate={onNavigate} />
      )}
    </nav>
  )
}
