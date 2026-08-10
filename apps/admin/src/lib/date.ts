const KYIV_TIME_ZONE = 'Europe/Kyiv'

export function formatDate(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date
  return value.toLocaleDateString('uk-UA', { timeZone: KYIV_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' })
}

/** Age in full years, as of today in Europe/Kyiv (not UTC — the two disagree near midnight). */
export function calculateAge(bornOn: Date | string): number {
  const born = typeof bornOn === 'string' ? new Date(bornOn) : bornOn
  const todayInKyiv = new Date(new Date().toLocaleString('en-US', { timeZone: KYIV_TIME_ZONE }))
  let age = todayInKyiv.getFullYear() - born.getFullYear()
  const hasHadBirthdayThisYear =
    todayInKyiv.getMonth() > born.getMonth() ||
    (todayInKyiv.getMonth() === born.getMonth() && todayInKyiv.getDate() >= born.getDate())
  if (!hasHadBirthdayThisYear) age -= 1
  return age
}
