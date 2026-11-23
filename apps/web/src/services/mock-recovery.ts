import {
  recoveryRequestSchema,
  recoveryRequestUpdateSchema,
  resetLinkIssueSchema,
  resetPasswordSchema,
  type ActivationLinkDto,
  type IssuedResetLink,
  type RecoveryKind,
  type RecoveryRequestDto,
  type RecoveryStatus,
  type ResetLinkDto,
  type ResetLinkProblem,
} from '@testboard/shared'
import { ApiClientError } from './api-client'
import type { DataSource } from './data-source'

/**
 * Demo version of account recovery (ADR 0012), same rules as the API: one active link per
 * account, single use, owner and inactive accounts refused, duplicate requests merged.
 */
type RecoveryMethods = Pick<
  DataSource,
  | 'submitRecoveryRequest'
  | 'checkResetLink'
  | 'resetPassword'
  | 'getRecoverySummary'
  | 'listRecoveryRequests'
  | 'updateRecoveryRequest'
  | 'listResetLinks'
  | 'issueResetLink'
  | 'revokeResetLink'
>

interface MockRequest {
  id: string
  kind: RecoveryKind
  status: RecoveryStatus
  name: string
  email: string | null
  contact: string | null
  message: string | null
  submitCount: number
  createdAt: string
  lastSubmittedAt: string
  userId: string | null
  handledBy: string | null
  handledAt: string | null
  note: string | null
}

interface MockLink {
  id: string
  userId: string
  token: string
  active: boolean
  issuedAt: string
  expiresAt: string
  issuedBy: string | null
  requestId: string | null
  usedAt: string | null
  revokedAt: string | null
}

interface Context {
  delay: <T>(value: () => T) => Promise<T>
  users: () => { id: string; display_name: string; email: string }[]
  currentUserId: () => string
  requireSuperAdmin: () => void
  isPermanent: (userId: string) => boolean
  isActive: (userId: string) => boolean
  linkHours: () => number
  /** false = the account never had a password (made from a name + e-mail). */
  isActivated: (userId: string) => boolean
  activate: (userId: string) => void
  audit: (entityType: string, entityId: string, action: string, newValues?: unknown) => void
  newId: () => string
}

const HOUR = 3_600_000

function error(status: number, code: 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN', reason?: string) {
  return new ApiClientError(
    status,
    code,
    reason ?? code,
    'mock-request',
    reason ? [{ field: 'reset_link', message: reason }] : [],
  )
}

function invalid(issues: { path: PropertyKey[]; message: string }[]): never {
  throw new ApiClientError(
    422,
    'VALIDATION_ERROR',
    'The submitted data is invalid.',
    'mock-request',
    issues.map((issue) => ({ field: issue.path.map(String).join('.'), message: issue.message })),
  )
}

function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function createMockRecovery(ctx: Context) {
  const now = () => new Date()
  const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString()
  // Fictitious examples so the demo inbox is not empty.
  const requests: MockRequest[] = [
    {
      id: ctx.newId(),
      kind: 'FORGOT_PASSWORD',
      status: 'OPEN',
      name: 'Demo Penguji 2',
      email: 'penguji2@demo.invalid',
      contact: 'WhatsApp kantor (contoh)',
      message: 'Lupa kata sandi setelah cuti.',
      submitCount: 1,
      createdAt: ago(3),
      lastSubmittedAt: ago(3),
      userId: '4',
      handledBy: null,
      handledAt: null,
      note: null,
    },
    {
      id: ctx.newId(),
      kind: 'FORGOT_EMAIL',
      status: 'OPEN',
      name: 'Demo Pemantau',
      email: null,
      contact: 'Email pribadi (contoh): pemantau.lain@demo.invalid',
      message: 'Tidak ingat email yang didaftarkan.',
      submitCount: 2,
      createdAt: ago(26),
      lastSubmittedAt: ago(1),
      userId: null,
      handledBy: null,
      handledAt: null,
      note: null,
    },
  ]
  const links: MockLink[] = []

  const user = (userId: string) => ctx.users().find((u) => u.id === userId)
  const ref = (userId: string | null) => {
    const found = userId ? user(userId) : undefined
    return found ? { id: found.id, display_name: found.display_name } : null
  }
  const isLive = (link: MockLink) => link.active && Date.parse(link.expiresAt) > Date.now()
  const activeLink = (userId: string) => links.find((l) => l.userId === userId && isLive(l))

  const linkDto = (link: MockLink): ResetLinkDto => {
    const owner = user(link.userId)
    return {
      id: link.id,
      user: {
        id: link.userId,
        display_name: owner?.display_name ?? '',
        email: owner?.email ?? '',
      },
      issued_at: link.issuedAt,
      expires_at: link.expiresAt,
      issued_by: ref(link.issuedBy),
      request_id: link.requestId,
    }
  }

  const requestDto = (r: MockRequest): RecoveryRequestDto => {
    const owner = r.userId ? user(r.userId) : undefined
    const live = r.userId ? activeLink(r.userId) : undefined
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      name: r.name,
      email: r.email,
      contact: r.contact,
      message: r.message,
      submit_count: r.submitCount,
      created_at: r.createdAt,
      last_submitted_at: r.lastSubmittedAt,
      user: owner
        ? {
            id: owner.id,
            display_name: owner.display_name,
            email: owner.email,
            is_active: ctx.isActive(owner.id),
            is_permanent: ctx.isPermanent(owner.id),
          }
        : null,
      active_link: live ? linkDto(live) : null,
      handled_by: ref(r.handledBy),
      handled_at: r.handledAt,
      note: r.note,
    }
  }

  const usable = (token: string): MockLink => {
    const link = links.find((l) => l.token === token)
    const fail = (problem: ResetLinkProblem): never => {
      throw new ApiClientError(
        404,
        'NOT_FOUND',
        'This reset link cannot be used.',
        'mock-request',
        [{ field: 'token', message: problem }],
      )
    }
    if (!link) return fail('INVALID')
    if (link.usedAt) return fail('USED')
    if (link.revokedAt) return fail('REVOKED')
    if (!isLive(link)) return fail('EXPIRED')
    if (!ctx.isActive(link.userId)) return fail('INVALID')
    return link
  }

  const revoke = (link: MockLink) => {
    link.active = false
    link.revokedAt = now().toISOString()
  }

  const methods: RecoveryMethods = {
    submitRecoveryRequest: (input) =>
      ctx.delay(() => {
        const parsed = recoveryRequestSchema.safeParse(input)
        if (!parsed.success) invalid(parsed.error.issues)
        const value = parsed.data
        if (value.website) return
        const email = value.kind === 'FORGOT_PASSWORD' ? value.email : null
        const contact = value.contact ?? null
        const existing = requests.find(
          (r) =>
            r.status === 'OPEN' &&
            r.kind === value.kind &&
            (email ? r.email === email : r.name === value.name && r.contact === contact),
        )
        const at = now().toISOString()
        if (existing) {
          existing.submitCount += 1
          existing.lastSubmittedAt = at
          existing.contact = contact ?? existing.contact
          existing.message = value.message ?? existing.message
          return
        }
        const created: MockRequest = {
          id: ctx.newId(),
          kind: value.kind,
          status: 'OPEN',
          name: value.name,
          email,
          contact,
          message: value.message ?? null,
          submitCount: 1,
          createdAt: at,
          lastSubmittedAt: at,
          userId: email ? (ctx.users().find((u) => u.email === email)?.id ?? null) : null,
          handledBy: null,
          handledAt: null,
          note: null,
        }
        requests.push(created)
        ctx.audit('recovery_request', created.id, 'CREATE', { kind: value.kind })
      }),

    checkResetLink: (token) =>
      ctx.delay(() => {
        const link = usable(token)
        const owner = user(link.userId)
        return {
          email: owner?.email ?? '',
          display_name: owner?.display_name ?? '',
          issued_at: link.issuedAt,
          expires_at: link.expiresAt,
          activation: !ctx.isActivated(link.userId),
        }
      }),

    resetPassword: (input) =>
      ctx.delay(() => {
        const parsed = resetPasswordSchema.safeParse(input)
        if (!parsed.success) invalid(parsed.error.issues)
        const link = usable(parsed.data.token)
        const local = user(link.userId)?.email.split('@')[0] ?? ''
        if (local && parsed.data.new_password.toLowerCase().includes(local)) {
          invalid([
            { path: ['new_password'], message: 'Password must not contain your e-mail name' },
          ])
        }
        link.active = false
        link.usedAt = now().toISOString()
        ctx.activate(link.userId)
        for (const r of requests) {
          if (r.userId === link.userId && r.status === 'OPEN') {
            r.status = 'RESOLVED'
            r.handledAt = link.usedAt
            r.handledBy = null
          }
        }
        ctx.audit('user', link.userId, 'PASSWORD_RESET', { reset_link_id: link.id })
      }),

    getRecoverySummary: () =>
      ctx.delay(() => {
        ctx.requireSuperAdmin()
        return {
          open_requests: requests.filter((r) => r.status === 'OPEN').length,
          active_links: links.filter(isLive).length,
        }
      }),

    listRecoveryRequests: (status = 'OPEN') =>
      ctx.delay(() => {
        ctx.requireSuperAdmin()
        return requests
          .filter((r) => status === 'ALL' || r.status === status)
          .sort(
            (a, b) =>
              Number(b.status === 'OPEN') - Number(a.status === 'OPEN') ||
              b.lastSubmittedAt.localeCompare(a.lastSubmittedAt),
          )
          .map(requestDto)
      }),

    updateRecoveryRequest: (requestId, input) =>
      ctx.delay(() => {
        ctx.requireSuperAdmin()
        const parsed = recoveryRequestUpdateSchema.safeParse(input)
        if (!parsed.success) invalid(parsed.error.issues)
        const r = requests.find((x) => x.id === requestId)
        if (!r) throw error(404, 'NOT_FOUND')
        const value = parsed.data
        if (value.user_id && !user(value.user_id)) {
          invalid([{ path: ['user_id'], message: 'Unknown account' }])
        }
        const before = r.status
        if (value.user_id !== undefined) r.userId = value.user_id
        if (value.note !== undefined) r.note = value.note
        if (value.status && value.status !== before) {
          r.status = value.status
          r.handledBy = value.status === 'OPEN' ? null : ctx.currentUserId()
          r.handledAt = value.status === 'OPEN' ? null : now().toISOString()
        }
        ctx.audit('recovery_request', r.id, r.status !== before ? 'STATUS_CHANGE' : 'UPDATE', {
          status: r.status,
        })
        return requestDto(r)
      }),

    listResetLinks: () =>
      ctx.delay(() => {
        ctx.requireSuperAdmin()
        return links
          .filter(isLive)
          .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
          .map(linkDto)
      }),

    issueResetLink: (userId, input = {}) =>
      ctx.delay((): IssuedResetLink => {
        ctx.requireSuperAdmin()
        const parsed = resetLinkIssueSchema.safeParse(input)
        if (!parsed.success) invalid(parsed.error.issues)
        if (!user(userId)) throw error(404, 'NOT_FOUND')
        if (ctx.isPermanent(userId)) {
          throw new ApiClientError(
            403,
            'FORBIDDEN',
            'The permanent Super Admin is recovered on the server only.',
            'mock-request',
            [{ field: 'user', message: 'PERMANENT_SUPER_ADMIN' }],
          )
        }
        if (!ctx.isActive(userId)) {
          throw new ApiClientError(409, 'CONFLICT', 'Inactive', 'mock-request', [
            { field: 'user', message: 'ACCOUNT_INACTIVE' },
          ])
        }
        const requestId = parsed.data.request_id ?? null
        if (requestId) {
          const r = requests.find((x) => x.id === requestId)
          if (!r) throw error(404, 'NOT_FOUND')
          if (r.userId && r.userId !== userId) {
            throw new ApiClientError(409, 'CONFLICT', 'Other account', 'mock-request', [
              { field: 'request_id', message: 'REQUEST_OTHER_ACCOUNT' },
            ])
          }
          r.userId = userId
        }
        const current = activeLink(userId)
        if (current && !parsed.data.replace) throw error(409, 'CONFLICT', 'RESET_LINK_ACTIVE')
        if (current) {
          revoke(current)
          ctx.audit('reset_link', current.id, 'REVOKE', { user_id: userId, replaced: true })
        }
        const issued = now()
        const link: MockLink = {
          id: ctx.newId(),
          userId,
          token: randomToken(),
          active: true,
          issuedAt: issued.toISOString(),
          expiresAt: new Date(issued.getTime() + ctx.linkHours() * HOUR).toISOString(),
          issuedBy: ctx.currentUserId(),
          requestId,
          usedAt: null,
          revokedAt: null,
        }
        links.push(link)
        ctx.audit('reset_link', link.id, 'CREATE', {
          user_id: userId,
          valid_hours: ctx.linkHours(),
          replaced: Boolean(current),
        })
        return { link: linkDto(link), token: link.token }
      }),

    revokeResetLink: (userId) =>
      ctx.delay(() => {
        ctx.requireSuperAdmin()
        const current = activeLink(userId)
        if (!current) throw error(404, 'NOT_FOUND')
        revoke(current)
        ctx.audit('reset_link', current.id, 'REVOKE', { user_id: userId })
      }),
  }

  return {
    methods,
    /** Same rules as the API: only an active account that never had a password. */
    activationLink(userId: string): ActivationLinkDto {
      if (!user(userId)) throw error(404, 'NOT_FOUND')
      if (!ctx.isActive(userId)) {
        throw new ApiClientError(409, 'CONFLICT', 'Inactive', 'mock-request', [
          { field: 'user', message: 'ACCOUNT_INACTIVE' },
        ])
      }
      if (ctx.isActivated(userId)) {
        throw new ApiClientError(409, 'CONFLICT', 'Active', 'mock-request', [
          { field: 'user', message: 'ALREADY_ACTIVE' },
        ])
      }
      const current = activeLink(userId)
      if (current) revoke(current)
      const issued = now()
      const link: MockLink = {
        id: ctx.newId(),
        userId,
        token: randomToken(),
        active: true,
        issuedAt: issued.toISOString(),
        expiresAt: new Date(issued.getTime() + ctx.linkHours() * HOUR).toISOString(),
        issuedBy: ctx.currentUserId(),
        requestId: null,
        usedAt: null,
        revokedAt: null,
      }
      links.push(link)
      ctx.audit('reset_link', link.id, 'CREATE', { user_id: userId, activation: true })
      return { token: link.token, expires_at: link.expiresAt }
    },
    /** For the users list: the account's active link (validity only). */
    activeLinkOf(userId: string) {
      const link = activeLink(userId)
      return link ? { issued_at: link.issuedAt, expires_at: link.expiresAt } : null
    },
  }
}

export type MockRecovery = ReturnType<typeof createMockRecovery>
