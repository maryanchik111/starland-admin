import { describe, expect, it } from 'vitest'
import { buildHref, nextSortHref } from '../src/components/data-table/query-string.js'

describe('buildHref', () => {
  it('merges existing params with overrides', () => {
    expect(buildHref('/students', { q: 'petro', page: '2' }, { page: 3 })).toBe(
      '/students?q=petro&page=3',
    )
  })

  it('drops a param when the override is undefined', () => {
    expect(buildHref('/students', { q: 'petro', sort: 'bornOn' }, { sort: undefined })).toBe(
      '/students?q=petro',
    )
  })

  it('preserves repeated params', () => {
    expect(buildHref('/students', { tag: ['a', 'b'] }, {})).toBe('/students?tag=a&tag=b')
  })

  it('returns the bare path when there are no params left', () => {
    expect(buildHref('/students', undefined, {})).toBe('/students')
  })
})

describe('nextSortHref', () => {
  it('sets sort and direction and resets the page', () => {
    expect(nextSortHref('/students', { page: '3', q: 'petro' }, 'bornOn', 'asc')).toBe(
      '/students?q=petro&sort=bornOn&dir=asc',
    )
  })

  it('clears sort and direction when direction is undefined', () => {
    expect(nextSortHref('/students', { sort: 'bornOn', dir: 'asc', q: 'petro' }, 'bornOn', undefined)).toBe(
      '/students?q=petro',
    )
  })
})
