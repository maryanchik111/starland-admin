import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'

const createdYearIds: string[] = []

async function trackYear(name: string, startsOn: Date, endsOn: Date) {
  const year = await prisma.academicYear.create({
    data: { name, startsOn, endsOn },
  })
  createdYearIds.push(year.id)
  return year
}

afterEach(async () => {
  while (createdYearIds.length > 0) {
    const yearId = createdYearIds.pop()
    if (!yearId) continue
    await prisma.academicCalendarDay.deleteMany({ where: { academicYearId: yearId } })
    await prisma.class.deleteMany({ where: { academicYearId: yearId } })
    await prisma.academicPeriod.deleteMany({ where: { academicYearId: yearId } })
    await prisma.academicYear.delete({ where: { id: yearId } })
  }
})

describe('school structure', () => {
  it('rejects two classes with the same name in one academic year', async () => {
    const year = await trackYear(`2026/2027-${randomUUID()}`, new Date('2026-09-01'), new Date('2027-06-30'))
    await prisma.class.create({ data: { academicYearId: year.id, gradeLevel: 5, name: '5-А' } })

    await expect(
      prisma.class.create({ data: { academicYearId: year.id, gradeLevel: 5, name: '5-А' } }),
    ).rejects.toThrow()
  })

  it('marks calendar days as non-teaching', async () => {
    const year = await trackYear(`2027/2028-${randomUUID()}`, new Date('2027-09-01'), new Date('2028-06-30'))
    const day = await prisma.academicCalendarDay.create({
      data: { academicYearId: year.id, date: new Date('2027-10-26'), kind: 'holiday', title: 'Осінні канікули' },
    })

    expect(day.isTeachingDay).toBe(false)
  })
})
