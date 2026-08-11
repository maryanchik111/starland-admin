import { PrismaClient } from '@prisma/client'

const globalForApp = globalThis as unknown as { appPrisma?: PrismaClient }

const appDatabaseUrl = process.env.APP_DATABASE_URL
if (!appDatabaseUrl) {
  throw new Error('APP_DATABASE_URL is not set')
}

/** Runtime client: connects as a role that cannot bypass RLS. */
export const appPrisma =
  globalForApp.appPrisma ??
  new PrismaClient({ datasources: { db: { url: appDatabaseUrl } } })

if (process.env.NODE_ENV !== 'production') globalForApp.appPrisma = appPrisma

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/**
 * Runs queries on behalf of a user. The context lives for exactly one
 * transaction: `set_config(..., true)` and `set local role` both reset at
 * transaction end, so a connection handed back to the pool carries no
 * leftover identity or privilege from this call.
 */
export async function withUserContext<T>(
  authUserId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return appPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: authUserId,
      role: 'authenticated',
    })}, true)`
    await tx.$executeRawUnsafe('set local role authenticated')
    return fn(tx)
  })
}
