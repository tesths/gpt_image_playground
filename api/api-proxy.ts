import {
  buildApiProxyUrl,
  createProxyErrorResponse,
  createProxyRequestHeaders,
  createProxyResponseHeaders,
  resolveApiProxyBaseUrl,
} from '../src/lib/vercelProxy'

const API_PROXY_ALLOW = 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS'
const serverEnv = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> }
}).process?.env ?? {}

async function handle(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        Allow: API_PROXY_ALLOW,
        'Cache-Control': 'no-store',
      },
    })
  }

  try {
    const url = new URL(request.url)
    const baseUrl = resolveApiProxyBaseUrl(
      serverEnv.API_PROXY_URL,
      serverEnv.API_PROXY_ALLOWLIST,
      request.headers.get('x-api-proxy-target'),
    )
    const targetUrl = buildApiProxyUrl(baseUrl, url.searchParams.get('path'), url.searchParams)
    const headers = createProxyRequestHeaders(request.headers)
    const init: RequestInit & { duplex?: 'half' } = {
      method: request.method,
      headers,
      redirect: 'manual',
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body
      init.duplex = 'half'
    }

    const response = await fetch(targetUrl, init)
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
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
export const HEAD = handle
export const OPTIONS = handle
