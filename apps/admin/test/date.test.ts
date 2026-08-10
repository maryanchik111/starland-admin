import { describe, expect, it, vi } from 'vitest'
import { calculateAge } from '../src/lib/date.js'

describe('calculateAge', () => {
  it('counts a full year once the birthday has passed this year', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T12:00:00Z'))
    expect(calculateAge('2015-08-10')).toBe(11)
    expect(calculateAge('2015-08-09')).toBe(11)
    vi.useRealTimers()
  })

  it('does not count this year until the birthday arrives', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T12:00:00Z'))
    expect(calculateAge('2015-08-11')).toBe(10)
    expect(calculateAge('2015-12-31')).toBe(10)
    vi.useRealTimers()
  })
})
