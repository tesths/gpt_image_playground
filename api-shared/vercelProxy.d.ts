export function isBlockedProxyHost(hostname: string): boolean
export function normalizeProxyBaseUrl(value: string | undefined | null): string
export function parseProxyBaseUrlList(value: string | undefined): string[]
export function resolveApiProxyBaseUrl(defaultTarget: string | undefined, allowlist: string | undefined, requestedTarget: string | null): string
export function buildApiProxyUrl(baseUrl: string, path: string | null, params: URLSearchParams): string
export function resolveImageProxyUrl(rawUrl: string | null, allowlist: string | undefined): string
export function createProxyRequestHeaders(headers: Headers): Headers
export function createProxyResponseHeaders(headers: Headers): Headers
export function createProxyErrorResponse(err: unknown, status?: number): Response
