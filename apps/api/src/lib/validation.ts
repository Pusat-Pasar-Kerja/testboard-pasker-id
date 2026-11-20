import type { Context } from 'hono'
import type { z } from 'zod'
import { AppError } from './errors.js'

function toDetails(error: z.ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || undefined,
    message: issue.message,
  }))
}

/** Parse and validate a JSON body; 422 with per-field details on failure. */
export async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'Request body must be valid JSON.')
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'The submitted data is invalid.',
      toDetails(result.error),
    )
  }
  return result.data
}

export function parseWith<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'The submitted data is invalid.',
      toDetails(result.error),
    )
  }
  return result.data
}

/** Route ids are BIGINT; anything else is simply "not found" (no type leak). */
export function idParam(c: Context, name: string): string {
  const value = c.req.param(name)
  if (!value || !/^\d{1,20}$/.test(value)) throw new AppError(404, 'NOT_FOUND', 'Not found.')
  return value
}

export function pageParams(c: Context): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1)
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(c.req.query('page_size') ?? '25', 10) || 25),
  )
  return { page, pageSize, offset: (page - 1) * pageSize }
}
