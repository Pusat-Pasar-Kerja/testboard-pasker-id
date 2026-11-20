import { API_ERROR_CODES, isOneOf, type ApiErrorBody, type ApiErrorCode } from '@testboard/shared'

/** Error raised for any non-2xx API response, carrying the stable error code for i18n. */
export class ApiClientError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly requestId: string | null

  constructor(status: number, code: ApiErrorCode, message: string, requestId: string | null) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

const isApiErrorCode = isOneOf(API_ERROR_CODES)

function parseErrorBody(value: unknown): ApiErrorBody['error'] | null {
  if (typeof value !== 'object' || value === null || !('error' in value)) return null
  const error = (value as { error: unknown }).error
  if (typeof error !== 'object' || error === null) return null
  const { code, message, request_id } = error as Record<string, unknown>
  if (!isApiErrorCode(code)) return null
  return {
    code,
    message: typeof message === 'string' ? message : '',
    details: [],
    request_id: typeof request_id === 'string' ? request_id : null,
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export function createApiClient(baseUrl: string, fetchImpl: FetchLike = fetch) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        // Session cookie (Milestone 2) is HttpOnly and same-origin; never a token in storage.
        credentials: 'same-origin',
        ...init,
        headers: { Accept: 'application/json', ...init.headers },
      })
    } catch {
      throw new ApiClientError(0, 'INTERNAL_ERROR', 'Network error', null)
    }

    if (!response.ok) {
      const parsed = parseErrorBody(await response.json().catch(() => null))
      throw new ApiClientError(
        response.status,
        parsed?.code ?? 'INTERNAL_ERROR',
        parsed?.message ?? response.statusText,
        parsed?.request_id ?? response.headers.get('X-Request-Id'),
      )
    }
    return (await response.json()) as T
  }

  return { get: <T>(path: string) => request<T>(path) }
}

export type ApiClient = ReturnType<typeof createApiClient>
