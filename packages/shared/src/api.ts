/**
 * API contract primitives shared by apps/api and apps/web.
 * See docs/blueprint/docs/06_API_CONTRACT.md.
 */

export const API_BASE_PATH = '/api/v1'
export const REQUEST_ID_HEADER = 'X-Request-Id'

export const PAGINATION = {
  defaultPage: 1,
  defaultPageSize: 25,
  maxPageSize: 100,
} as const

/** Stable error codes. The frontend translates these via i18n keys `errors.<CODE>`. */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const
export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export interface ApiErrorDetail {
  field?: string
  message: string
}

/** Uniform error envelope: `{ "error": { code, message, details, request_id } }`. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode
    message: string
    details: ApiErrorDetail[]
    request_id: string | null
  }
}

export interface Paginated<T> {
  data: T[]
  page: number
  page_size: number
  total: number
}

export interface HealthResponse {
  /** 'degraded' (HTTP 503) when a required dependency such as the database is down. */
  status: 'ok' | 'degraded'
  service: 'testboard-api'
  version: string
  time: string
  database: 'not_configured' | 'up' | 'down'
}

/**
 * MySQL BIGINT UNSIGNED ids are serialised as strings in JSON so JavaScript
 * never loses precision (Number.MAX_SAFE_INTEGER < 2^64).
 */
export type IdString = string

export function toIdString(value: bigint | number | string): IdString {
  if (typeof value === 'string') {
    if (!/^\d+$/.test(value)) throw new TypeError(`Invalid id: ${value}`)
    return value
  }
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
    throw new TypeError(`Unsafe numeric id: ${value}`)
  }
  return value.toString()
}
