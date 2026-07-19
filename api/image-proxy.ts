import {
  createProxyErrorResponse,
  createProxyResponseHeaders,
  resolveImageProxyUrl,
} from '../api-shared/vercelProxy.js'

const IMAGE_PROXY_ALLOW = 'GET, HEAD, OPTIONS'
const MAX_IMAGE_PROXY_REDIRECTS = 5
const serverEnv = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> }
}).process?.env ?? {}

async function fetchAllowlistedImage(rawUrl: string, request: Request): Promise<Response> {
  let targetUrl = resolveImageProxyUrl(rawUrl, serverEnv.IMAGE_PROXY_ALLOWLIST)

  for (let i = 0; i <= MAX_IMAGE_PROXY_REDIRECTS; i++) {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        Accept: request.headers.get('Accept') || 'image/*,*/*;q=0.8',
      },
      redirect: 'manual',
    })

    if (![301, 302, 303, 307, 308].includes(response.status)) return response

    const location = response.headers.get('Location')
    if (!location) throw new Error('图片 URL 重定向响应缺少 Location。')
    targetUrl = resolveImageProxyUrl(new URL(location, targetUrl).toString(), serverEnv.IMAGE_PROXY_ALLOWLIST)
  }

  throw new Error('图片 URL 重定向次数过多。')
}

async function handle(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        Allow: IMAGE_PROXY_ALLOW,
        'Cache-Control': 'no-store',
      },
    })
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return createProxyErrorResponse(new Error('图片代理只支持 GET/HEAD 请求。'), 405)
  }

  try {
    const url = new URL(request.url)
    const response = await fetchAllowlistedImage(url.searchParams.get('url') ?? '', request)

    if (!response.ok) {
      return createProxyErrorResponse(new Error(`图片 URL 下载失败：HTTP ${response.status}`), response.status)
    }

    const contentType = response.headers.get('Content-Type')?.toLowerCase() ?? ''
    if (contentType && !contentType.startsWith('image/') && !contentType.includes('application/octet-stream')) {
      return createProxyErrorResponse(new Error('图片代理拒绝了非图片响应。'), 415)
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: createProxyResponseHeaders(response.headers),
    })
  } catch (err) {
    return createProxyErrorResponse(err)
  }
}

export const GET = handle
export const HEAD = handle
export const OPTIONS = handle
