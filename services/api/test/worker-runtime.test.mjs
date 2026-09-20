import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

describe('Worker runtime harness', () => {
  it('boots the API Worker inside workerd and returns JSON', async () => {
    const response = await exports.default.fetch('https://example.invalid/health')

    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toBeTypeOf('object')
  })
})
