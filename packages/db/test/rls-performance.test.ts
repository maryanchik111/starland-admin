import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asUser } from './rls-harness.js'
import { cleanupLargeDataset, seedLargeDataset, type LargeDataset } from './fixtures/large-dataset.js'

describe('rls performance', () => {
  let data: LargeDataset

  beforeAll(async () => {
    data = await seedLargeDataset()
  }, 120_000)

  afterAll(async () => {
    if (data) await cleanupLargeDataset(data)
  }, 120_000)

  it('lists visible students in under 750ms', async () => {
    const ms = await asUser(data.teacherAuthId, async (c) => {
      const started = performance.now()
      await c.$queryRawUnsafe<Array<{ id: string; first_name: string; last_name: string }>>(
        'select id, first_name, last_name from students order by last_name limit 100',
      )
      return performance.now() - started
    })

    // Wall-clock on local Docker Postgres, so this is machine- and
    // contention-dependent, not a strict product SLA. 750ms leaves a wide
    // margin above the ~300ms typically seen when this suite runs alongside
    // sibling packages' test suites under turbo's concurrency, while still
    // being tight enough to catch a real regression to per-row scope
    // evaluation (which would push this into the seconds, not hundreds of
    // ms, at this row count). The second test in this file is the one that
    // actually proves the query plan doesn't re-evaluate per row — this one
    // is a coarse tripwire, not the primary evidence.
    expect(ms).toBeLessThan(750)
  })

  it('does not re-evaluate the scope subquery per row', async () => {
    const plan = await asUser(data.teacherAuthId, async (c) => {
      const rows = await c.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
        'explain (analyze, format text) select id from students',
      )
      return rows.map((row) => row['QUERY PLAN']).join('\n')
    })

    // The user_effective_scopes subquery must collapse into a hashed
    // SubPlan / InitPlan evaluated once per query, not run for every row of
    // students. A per-row scalar helper shows up as a SubPlan with a `loops=`
    // count in the hundreds — which is what the second assertion rejects.
    expect(plan).toMatch(/SubPlan|InitPlan|Hash/i)
    expect(plan).not.toMatch(/rows=\d+ loops=[1-9]\d{2,}/)
  })
})
