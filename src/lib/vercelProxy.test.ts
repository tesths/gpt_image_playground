import { describe, expect, it } from 'vitest'
import {
  buildApiProxyUrl,
  createProxyRequestHeaders,
  isBlockedProxyHost,
  resolveApiProxyBaseUrl,
  resolveImageProxyUrl,
} from './vercelProxy'

describe('Vercel proxy helpers', () => {
  it('uses the default API target when no explicit target is provided', () => {
    expect(resolveApiProxyBaseUrl('https://api.example.com/v1', '', null)).toBe('https://api.example.com/v1')
  })

  it('allows explicit API targets only when they match the allowlist', () => {
    expect(resolveApiProxyBaseUrl(
      'https://api-a.example.com/v1',
      'https://api-a.example.com/v1,https://api-b.example.com/v1',
      'https://api-b.example.com/v1',
    )).toBe('https://api-b.example.com/v1')

    expect(() => resolveApiProxyBaseUrl(
      'https://api-a.example.com/v1',
      'https://api-a.example.com/v1',
      'https://api-b.example.com/v1',
    )).toThrow('白名单')
  })

  it('accepts comma and newline separated API allowlists for multiple upstream domains', () => {
    expect(resolveApiProxyBaseUrl(
      'https://api-a.example.com/v1',
      'https://api-a.example.com/v1\nhttps://api-b.example.com/v1, https://api-c.example.com/v1',
      'https://api-c.example.com/v1',
    )).toBe('https://api-c.example.com/v1')
  })

  it('preserves base paths and query params when building upstream API URLs', () => {
    const params = new URLSearchParams('path=images/generations&async=true')

    expect(buildApiProxyUrl('https://api.example.com/v1', 'images/generations', params)).toBe(
      'https://api.example.com/v1/images/generations?async=true',
    )
  })

  it('rejects private hosts for proxy targets', () => {
    expect(isBlockedProxyHost('localhost')).toBe(true)
    expect(isBlockedProxyHost('127.0.0.1')).toBe(true)
    expect(isBlockedProxyHost('192.168.1.10')).toBe(true)
    expect(isBlockedProxyHost('api.example.com')).toBe(false)
  })

  it('allows image URLs by exact host, wildcard host, or URL path prefix', () => {
    expect(resolveImageProxyUrl(
      'https://cdn.example.com/images/a.png',
      'cdn.example.com',
    )).toBe('https://cdn.example.com/images/a.png')
    expect(resolveImageProxyUrl(
      'https://assets.example.com/images/a.png',
      '*.example.com',
    )).toBe('https://assets.example.com/images/a.png')
    expect(resolveImageProxyUrl(
      'https://cdn.example.com/images/a.png',
      'https://cdn.example.com/images',
    )).toBe('https://cdn.example.com/images/a.png')
  })

  it('rejects unlisted or private image URLs', () => {
    expect(() => resolveImageProxyUrl('https://other.example.com/a.png', 'cdn.example.com')).toThrow('白名单')
    expect(() => resolveImageProxyUrl('http://127.0.0.1/a.png', '127.0.0.1')).toThrow('内网')
  })

  it('strips proxy control and platform headers before forwarding', () => {
    const headers = createProxyRequestHeaders(new Headers({
      Authorization: 'Bearer test',
      Cookie: 'session=secret',
      Host: 'app.example.com',
      Origin: 'https://app.example.com',
      Referer: 'https://app.example.com/',
      'X-Api-Proxy-Target': 'https://api.example.com/v1',
      'X-Vercel-Id': 'iad1::abc',
    }))

    expect(headers.get('Authorization')).toBe('Bearer test')
    expect(headers.has('Cookie')).toBe(false)
    expect(headers.has('Host')).toBe(false)
    expect(headers.has('Origin')).toBe(false)
    expect(headers.has('Referer')).toBe(false)
    expect(headers.has('X-Api-Proxy-Target')).toBe(false)
    expect(headers.has('X-Vercel-Id')).toBe(false)
  })
})
