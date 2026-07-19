import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const functionFiles = [
  'api/api-proxy.ts',
  'api/image-proxy.ts',
]

describe('vercel function runtime imports', () => {
  it('uses explicit TS extensions for api-to-src imports', () => {
    for (const file of functionFiles) {
      expect(readFileSync(resolve(file), 'utf-8')).not.toMatch(/from ['"]\.\.\/src\/lib\/vercelProxy['"]/)
    }
  })

  it('loads the function entrypoints with native ESM resolution', () => {
    const nodeMajor = Number(process.versions.node.split('.')[0])
    if (nodeMajor < 22) return

    const script = `
      Promise.all([
        import('./api/api-proxy.ts'),
        import('./api/image-proxy.ts'),
      ])
        .then(() => console.log('ok'))
        .catch((err) => {
          console.error(err)
          process.exit(1)
        })
    `

    expect(execFileSync(process.execPath, ['-e', script], {
      cwd: resolve('.'),
      encoding: 'utf-8',
    }).trim()).toBe('ok')
  })
})
