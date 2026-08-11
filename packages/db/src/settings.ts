import { prisma } from './client'
import { SETTINGS, type SettingKey } from '../prisma/seed/settings'

export async function getSetting<K extends SettingKey>(
  key: K,
): Promise<(typeof SETTINGS)[K]['value']> {
  if (!(key in SETTINGS)) {
    throw new Error(`Unknown setting: ${String(key)}`)
  }
  const row = await prisma.appSetting.findUnique({ where: { key } })
  return (row?.value ?? SETTINGS[key].value) as (typeof SETTINGS)[K]['value']
}
