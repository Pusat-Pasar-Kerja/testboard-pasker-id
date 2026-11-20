import type { ApiErrorBody, ApiErrorCode, ApiErrorDetail } from '@testboard/shared'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AppEnv } from '../types.js'

/** Throw from handlers/services for an expected, user-safe error response. */
export class AppError extends Error {
  readonly status: ContentfulStatusCode
  readonly code: ApiErrorCode
  readonly details: ApiErrorDetail[]

  constructor(
    status: ContentfulStatusCode,
    code: ApiErrorCode,
    message: string,
    details: ApiErrorDetail[] = [],
  ) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const STATUS_TO_CODE: Partial<Record<number, ApiErrorCode>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
}

const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  VALIDATION_ERROR: 'The submitted data is invalid.',
  UNAUTHENTICATED: 'Authentication is required.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'The request conflicts with the current state of the resource.',
  PAYLOAD_TOO_LARGE: 'The request payload is too large.',
  UNSUPPORTED_MEDIA_TYPE: 'The file or content type is not supported.',
  RATE_LIMITED: 'Too many requests. Please try again later.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable.',
  INTERNAL_ERROR: 'An unexpected error occurred.',
}

export function errorBody(
  c: Context<AppEnv>,
  code: ApiErrorCode,
  message: string = DEFAULT_MESSAGES[code],
  details: ApiErrorDetail[] = [],
): ApiErrorBody {
  return { error: { code, message, details, request_id: c.get('requestId') ?? null } }
}

export type ErrorLogger = (requestId: string | undefined, error: unknown) => void

export const consoleErrorLogger: ErrorLogger = (requestId, error) => {
  console.error(`[testboard-api] request_id=${requestId ?? '-'} unhandled error`, error)
}

/**
 * Uniform error envelope. Never leaks stack traces, SQL or storage keys to the client;
 * unexpected errors are logged server-side with the correlating request id.
 */
export function createErrorHandler(logError: ErrorLogger) {
  return (err: Error, c: Context<AppEnv>) => {
    if (err instanceof AppError) {
      return c.json(errorBody(c, err.code, err.message, err.details), err.status)
    }
    if (err instanceof HTTPException && err.status < 500) {
      const code = STATUS_TO_CODE[err.status] ?? 'VALIDATION_ERROR'
      return c.json(errorBody(c, code), err.status)
    }
    logError(c.get('requestId'), err)
    return c.json(errorBody(c, 'INTERNAL_ERROR'), 500)
  }
}
