import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Render Blueprint', () => {
  it('installs build-time dependencies when NODE_ENV is production', () => {
    const blueprint = readFileSync(resolve('render.yaml'), 'utf8')

    expect(blueprint).toContain(
      'buildCommand: npm ci --include=dev && npm run build',
    )
    expect(blueprint).toContain('value: production')
  })
})
