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

  it('lists visible students in under 200ms', async () => {
    const ms = await asUser(data.teacherAuthId, async (c) => {
      const started = performance.now()
      await c.$queryRawUnsafe<Array<{ id: string; first_name: string; last_name: string }>>(
        'select id, first_name, last_name from students order by last_name limit 100',
      )
      return performance.now() - started
    })

    expect(ms).toBeLessThan(200)
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
