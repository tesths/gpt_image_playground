import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../../api/image-proxy'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('image proxy function', () => {
  it('downloads images from any allowlisted image domain', async () => {
    vi.stubEnv('IMAGE_PROXY_ALLOWLIST', 'cdn-a.example.com,*.assets.example.com,https://cdn-b.example.com/generated')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    }))

    const response = await GET(new Request(
      'https://app.example.com/api/image-proxy?url=https%3A%2F%2Fcdn-b.example.com%2Fgenerated%2Foutput.png',
    ))

    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cdn-b.example.com/generated/output.png',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('supports wildcard image domains for multi-CDN results', async () => {
    vi.stubEnv('IMAGE_PROXY_ALLOWLIST', '*.assets.example.com')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([1]), {
      status: 200,
      headers: { 'Content-Type': 'image/webp' },
    }))

    const response = await GET(new Request(
      'https://app.example.com/api/image-proxy?url=https%3A%2F%2Fregion-a.assets.example.com%2Foutput.webp',
    ))

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://region-a.assets.example.com/output.webp',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('follows redirects only when the next image URL remains allowlisted', async () => {
    vi.stubEnv('IMAGE_PROXY_ALLOWLIST', 'cdn-a.example.com,cdn-b.example.com')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { Location: 'https://cdn-b.example.com/final.png' },
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([4, 5, 6]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }))

    const response = await GET(new Request(
      'https://app.example.com/api/image-proxy?url=https%3A%2F%2Fcdn-a.example.com%2Fredirect.png',
    ))

    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([4, 5, 6]))
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://cdn-a.example.com/redirect.png', expect.objectContaining({
      redirect: 'manual',
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://cdn-b.example.com/final.png', expect.objectContaining({
      redirect: 'manual',
    }))
  })

  it('rejects redirects to image domains outside the allowlist', async () => {
    vi.stubEnv('IMAGE_PROXY_ALLOWLIST', 'cdn-a.example.com')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { Location: 'https://cdn-b.example.com/final.png' },
      }))

    const response = await GET(new Request(
      'https://app.example.com/api/image-proxy?url=https%3A%2F%2Fcdn-a.example.com%2Fredirect.png',
    ))

    expect(response.status).toBe(400)
    expect(await response.text()).toContain('白名单')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects image domains outside the allowlist before forwarding', async () => {
    vi.stubEnv('IMAGE_PROXY_ALLOWLIST', 'cdn-a.example.com')
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    const response = await GET(new Request(
      'https://app.example.com/api/image-proxy?url=https%3A%2F%2Fcdn-b.example.com%2Foutput.png',
    ))

    expect(response.status).toBe(400)
    expect(await response.text()).toContain('白名单')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
