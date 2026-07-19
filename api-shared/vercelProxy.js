const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const INTERNAL_HEADER_PREFIXES = [
  'x-forwarded-',
  'x-vercel-',
]

function splitList(value) {
  return (value ?? '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function withProtocol(value) {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(value) ? value : `https://${value}`
}

function normalizeHost(hostname) {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, '')
}

function getIpv4Parts(hostname) {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return null
  const parts = hostname.split('.').map((part) => Number(part))
  return parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null
}

export function isBlockedProxyHost(hostname) {
  const host = normalizeHost(hostname)
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true

  const parts = getIpv4Parts(host)
  if (!parts) return false

  if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127) return true
  if (parts[0] === 169 && parts[1] === 254) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  return false
}

export function normalizeProxyBaseUrl(value) {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''

  try {
    const url = new URL(withProtocol(trimmed))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    if (isBlockedProxyHost(url.hostname)) return ''
    url.hash = ''
    url.search = ''
    url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

export function parseProxyBaseUrlList(value) {
  return splitList(value)
    .map((item) => normalizeProxyBaseUrl(item))
    .filter(Boolean)
}

export function resolveApiProxyBaseUrl(defaultTarget, allowlist, requestedTarget) {
  const defaultBaseUrl = normalizeProxyBaseUrl(defaultTarget)
  const requestedBaseUrl = normalizeProxyBaseUrl(requestedTarget)
  const allowed = parseProxyBaseUrlList(allowlist)
  const effectiveAllowed = allowed.length ? allowed : defaultBaseUrl ? [defaultBaseUrl] : []
  const target = requestedBaseUrl || defaultBaseUrl

  if (!target) throw new Error('API 代理未配置 API_PROXY_URL，且请求没有提供可用的代理目标。')
  if (!effectiveAllowed.includes(target)) throw new Error('API 代理目标不在 API_PROXY_ALLOWLIST 白名单中。')
  return target
}

function assertRelativeProxyPath(path) {
  const trimmed = path.trim().replace(/^\/+/, '')
  if (!trimmed) return ''
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed) || trimmed.includes('\\')) {
    throw new Error('代理路径必须是相对路径。')
  }

  const pathname = trimmed.split('?')[0]
  for (const segment of pathname.split('/')) {
    if (!segment) continue
    try {
      if (decodeURIComponent(segment) === '..') throw new Error('bad segment')
    } catch {
      if (segment === '..' || segment.toLowerCase() === '%2e%2e') throw new Error('代理路径不能包含上级目录。')
    }
  }
  return trimmed
}

export function buildApiProxyUrl(baseUrl, path, params) {
  const endpoint = assertRelativeProxyPath(path ?? '')
  const [pathname, query = ''] = endpoint.split('?')
  const target = new URL(pathname, `${baseUrl.replace(/\/+$/, '')}/`)
  const targetParams = new URLSearchParams(query)

  params.forEach((value, key) => {
    if (key !== 'path') targetParams.append(key, value)
  })

  target.search = targetParams.toString()
  return target.toString()
}

function imageAllowItemMatches(url, rawItem) {
  const item = rawItem.trim().toLowerCase()
  if (!item) return false

  if (item.startsWith('http://') || item.startsWith('https://')) {
    try {
      const allowed = new URL(item)
      if (allowed.protocol !== url.protocol || allowed.host !== url.host) return false
      const path = allowed.pathname.replace(/\/+$/, '')
      return !path || path === '/' || url.pathname.startsWith(path)
    } catch {
      return false
    }
  }

  const host = normalizeHost(url.hostname)
  const suffix = item.startsWith('*.') ? item.slice(2) : item.startsWith('.') ? item.slice(1) : ''
  if (suffix) return host === suffix || host.endsWith(`.${suffix}`)
  return host === item
}

export function resolveImageProxyUrl(rawUrl, allowlist) {
  if (!rawUrl?.trim()) throw new Error('缺少图片 URL。')

  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('图片 URL 格式无效。')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('图片 URL 只支持 HTTP/HTTPS。')
  if (isBlockedProxyHost(url.hostname)) throw new Error('图片代理不允许请求内网地址。')

  const allowed = splitList(allowlist)
  if (!allowed.length) throw new Error('图片代理未配置 IMAGE_PROXY_ALLOWLIST。')
  if (!allowed.some((item) => imageAllowItemMatches(url, item))) {
    throw new Error('图片 URL 域名不在 IMAGE_PROXY_ALLOWLIST 白名单中。')
  }

  return url.toString()
}

export function createProxyRequestHeaders(headers) {
  const next = new Headers(headers)
  next.delete('x-api-proxy-target')
  next.delete('cookie')
  next.delete('origin')
  next.delete('referer')

  const keys = []
  next.forEach((_, key) => keys.push(key))
  for (const key of keys) {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(lower) || INTERNAL_HEADER_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
      next.delete(key)
    }
  }

  return next
}

export function createProxyResponseHeaders(headers) {
  const next = new Headers(headers)
  next.set('Cache-Control', 'no-store')

  const keys = []
  next.forEach((_, key) => keys.push(key))
  for (const key of keys) {
    const lower = key.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(lower) || lower === 'content-encoding') {
      next.delete(key)
    }
  }

  return next
}

export function createProxyErrorResponse(err, status = 400) {
  const message = err instanceof Error ? err.message : String(err)
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
