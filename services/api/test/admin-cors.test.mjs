import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const ADMIN_ORIGIN = 'https://admin.example.invalid'

describe('Admin API CORS', () => {
  it('answers allowed Admin preflight before authentication', async () => {
    const response = await exports.default.fetch(
      new Request('https://example.invalid/v1/admin/spaces', {
        method: 'OPTIONS',
        headers: {
          origin: ADMIN_ORIGIN,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type'
        }
      })
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(ADMIN_ORIGIN)
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it('adds CORS headers to Admin authentication errors for the allowed origin', async () => {
    const response = await exports.default.fetch(
      new Request('https://example.invalid/v1/admin/spaces', {
        headers: { origin: ADMIN_ORIGIN }
      })
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('access-control-allow-origin')).toBe(ADMIN_ORIGIN)
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('rejects Admin requests from any other browser origin', async () => {
    const response = await exports.default.fetch(
      new Request('https://example.invalid/v1/admin/spaces', {
        headers: { origin: 'https://untrusted.example.invalid' }
      })
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('does not apply Admin CORS policy to public mini-program endpoints', async () => {
    const response = await exports.default.fetch(
      new Request('https://example.invalid/health', {
        headers: { origin: 'https://untrusted.example.invalid' }
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })
})
