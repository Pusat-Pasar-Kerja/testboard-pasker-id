import {
  API_ERROR_CODES,
  isOneOf,
  type ApiErrorBody,
  type ApiErrorCode,
  type ApiErrorDetail,
} from '@testboard/shared'

/** Error raised for any non-2xx API response, carrying the stable error code for i18n. */
export class ApiClientError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly requestId: string | null
  readonly details: ApiErrorDetail[]

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    requestId: string | null,
    details: ApiErrorDetail[] = [],
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.details = details
  }

  /** Per-field messages from a 422/409 response, keyed by field name. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      this.details.filter((d) => d.field).map((d) => [d.field as string, d.message]),
    )
  }
}

const isApiErrorCode = isOneOf(API_ERROR_CODES)

function parseErrorBody(value: unknown): ApiErrorBody['error'] | null {
  if (typeof value !== 'object' || value === null || !('error' in value)) return null
  const error = (value as { error: unknown }).error
  if (typeof error !== 'object' || error === null) return null
  const { code, message, request_id, details } = error as Record<string, unknown>
  if (!isApiErrorCode(code)) return null
  return {
    code,
    message: typeof message === 'string' ? message : '',
    details: Array.isArray(details)
      ? details.filter(
          (d): d is ApiErrorDetail =>
            typeof d === 'object' &&
            d !== null &&
            typeof (d as ApiErrorDetail).message === 'string',
        )
      : [],
    request_id: typeof request_id === 'string' ? request_id : null,
  }
}

/** The CSRF token lives in a JS-readable cookie bound to the session (ADR 0005). */
export function readCsrfToken(cookieString: string = document.cookie): string | null {
  for (const part of cookieString.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === 'tb_csrf' || name === '__Host-tb_csrf') return decodeURIComponent(rest.join('='))
  }
  return null
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export function createApiClient(
  baseUrl: string,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  csrf: () => string | null = () => readCsrfToken(),
) {
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json', ...extraHeaders }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (method !== 'GET') {
      const token = csrf()
      if (token) headers['X-CSRF-Token'] = token
    }
    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        // Session cookie is HttpOnly and same-origin; never a token in storage.
        credentials: 'same-origin',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
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
        parsed?.details ?? [],
      )
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  /**
   * Multipart upload with progress. XHR is used because fetch cannot report upload
   * progress; same-origin cookies and the CSRF header are sent like any other request.
   */
  function upload<T>(
    path: string,
    form: FormData,
    options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${baseUrl}${path}`)
      xhr.withCredentials = true
      xhr.setRequestHeader('Accept', 'application/json')
      const token = csrf()
      if (token) xhr.setRequestHeader('X-CSRF-Token', token)
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) options.onProgress?.(event.loaded / event.total)
      }
      xhr.onerror = () => reject(new ApiClientError(0, 'INTERNAL_ERROR', 'Network error', null))
      xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
      xhr.onload = () => {
        let json: unknown
        try {
          json = xhr.responseText ? JSON.parse(xhr.responseText) : null
        } catch {
          json = null
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(json as T)
          return
        }
        const parsed = parseErrorBody(json)
        reject(
          new ApiClientError(
            xhr.status,
            parsed?.code ?? 'INTERNAL_ERROR',
            parsed?.message ?? xhr.statusText,
            parsed?.request_id ?? xhr.getResponseHeader('X-Request-Id'),
            parsed?.details ?? [],
          ),
        )
      }
      options.signal?.addEventListener('abort', () => xhr.abort(), { once: true })
      xhr.send(form)
    })
  }

  return {
    /** Absolute path for authorized file streams (img src, download links). */
    url: (path: string) => `${baseUrl}${path}`,
    upload,
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body: unknown = {}, headers?: Record<string, string>) =>
      request<T>('POST', path, body, headers),
    patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
    put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
