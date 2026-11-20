import { describe, expect, it, vi } from 'vitest'
import { ApiClientError, createApiClient } from './api-client'

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('createApiClient', () => {
  it('prefixes the base URL and returns parsed JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'ok' }))
    const client = createApiClient('/api/v1', fetchImpl)

    await expect(client.get('/health')).resolves.toEqual({ status: 'ok' })
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/v1/health',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
  })

  it('maps the uniform error envelope to ApiClientError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(403, {
        error: { code: 'FORBIDDEN', message: 'No', details: [], request_id: 'req-1' },
      }),
    )
    const client = createApiClient('/api/v1', fetchImpl)

    const error = await client.get('/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiClientError)
    expect(error).toMatchObject({ status: 403, code: 'FORBIDDEN', requestId: 'req-1' })
  })

  it('falls back to INTERNAL_ERROR for unknown bodies and network failures', async () => {
    const badBody = createApiClient(
      '/api/v1',
      vi.fn().mockResolvedValue(new Response('<html>', { status: 502 })),
    )
    await expect(badBody.get('/x')).rejects.toMatchObject({ code: 'INTERNAL_ERROR', status: 502 })

    const offline = createApiClient('/api/v1', vi.fn().mockRejectedValue(new TypeError('fetch')))
    await expect(offline.get('/x')).rejects.toMatchObject({ code: 'INTERNAL_ERROR', status: 0 })
  })
})
