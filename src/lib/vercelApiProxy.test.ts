import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '../../api/api-proxy'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('api proxy function', () => {
  it('routes requests to an explicit allowlisted API target', async () => {
    vi.stubEnv('API_PROXY_URL', 'https://api-a.example.com/v1')
    vi.stubEnv('API_PROXY_ALLOWLIST', 'https://api-a.example.com/v1,https://api-b.example.com/v1')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const response = await POST(new Request('https://app.example.com/api/api-proxy?path=images/generations&async=true', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-key',
        'Content-Type': 'application/json',
        'X-Api-Proxy-Target': 'https://api-b.example.com/v1',
      },
      body: JSON.stringify({ prompt: 'test' }),
    }))

    expect(await response.text()).toBe('ok')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-b.example.com/v1/images/generations?async=true',
      expect.objectContaining({ method: 'POST' }),
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = init.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer test-key')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.has('X-Api-Proxy-Target')).toBe(false)
  })

  it('falls back to the default API target when no explicit target is sent', async () => {
    vi.stubEnv('API_PROXY_URL', 'https://api-a.example.com/v1')
    vi.stubEnv('API_PROXY_ALLOWLIST', 'https://api-a.example.com/v1,https://api-b.example.com/v1')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'))

    await GET(new Request('https://app.example.com/api/api-proxy?path=responses', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-key' },
    }))

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-a.example.com/v1/responses',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('rejects explicit API targets outside the allowlist before forwarding', async () => {
    vi.stubEnv('API_PROXY_URL', 'https://api-a.example.com/v1')
    vi.stubEnv('API_PROXY_ALLOWLIST', 'https://api-a.example.com/v1')
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    const response = await GET(new Request('https://app.example.com/api/api-proxy?path=responses', {
      method: 'GET',
      headers: { 'X-Api-Proxy-Target': 'https://api-b.example.com/v1' },
    }))

    expect(response.status).toBe(400)
    expect(await response.text()).toContain('白名单')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
