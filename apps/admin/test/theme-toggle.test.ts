import { describe, expect, it } from 'vitest'
import { nextThemeInCycle } from '../src/components/theme-toggle.js'

describe('nextThemeInCycle', () => {
  it('cycles light -> dark -> system -> light', () => {
    expect(nextThemeInCycle('light')).toBe('dark')
    expect(nextThemeInCycle('dark')).toBe('system')
    expect(nextThemeInCycle('system')).toBe('light')
  })

  it('treats an unknown value as system', () => {
    expect(nextThemeInCycle(undefined)).toBe('dark')
  })
})
