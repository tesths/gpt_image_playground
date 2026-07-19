import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchImageUrlAsDataUrl } from './imageApiShared'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('fetchImageUrlAsDataUrl', () => {
  it('falls back to the same-origin image proxy when direct fetch is blocked', async () => {
    vi.stubEnv('VITE_IMAGE_PROXY_AVAILABLE', 'true')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }))

    await expect(fetchImageUrlAsDataUrl('https://cdn.example.com/output.png', 'image/png')).resolves.toBe(
      'data:image/png;base64,AQID',
    )
    expect(fetchMock.mock.calls[1][0]).toBe('/api/image-proxy?url=https%3A%2F%2Fcdn.example.com%2Foutput.png')
  })

  it('reports proxy download errors when the image proxy is enabled but fails', async () => {
    vi.stubEnv('VITE_IMAGE_PROXY_AVAILABLE', 'true')
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new Error('allowlist rejected'))

    await expect(fetchImageUrlAsDataUrl('https://cdn.example.com/output.png', 'image/png')).rejects.toThrow(
      '图片已生成，但通过同源代理下载失败：allowlist rejected。',
    )
  })
})
