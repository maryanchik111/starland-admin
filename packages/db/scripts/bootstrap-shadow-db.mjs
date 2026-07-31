// Prepares the local Prisma shadow database used by `prisma migrate dev`.
//
// Idempotent: safe to re-run against an already-bootstrapped shadow
// database, after a Supabase volume reset, or on a clean checkout / CI
// runner. See docs/adr/0001-prisma-with-supabase-rls.md for why this exists.
//
// Plain Node (no build step) on purpose: this is one-time local/CI tooling,
// not application code, and isn't part of the typechecked `src` tree.

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const require = createRequire(import.meta.url)

const __dirname = dirname(fileURLToPath(import.meta.url))

const databaseUrl = process.env.DATABASE_URL
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL

if (!databaseUrl) throw new Error('DATABASE_URL is not set.')
if (!shadowDatabaseUrl) throw new Error('SHADOW_DATABASE_URL is not set.')

const shadowDbName = new URL(shadowDatabaseUrl).pathname.replace(/^\//, '')
if (!shadowDbName) {
  throw new Error(`Could not read a database name out of SHADOW_DATABASE_URL.`)
}

// Step 1: create the shadow database itself, if it doesn't exist yet.
// CREATE DATABASE cannot run inside a transaction, so this connects to the
// main database (same Postgres server) and issues it there, tolerating the
// "already exists" case to stay idempotent.
const maintenance = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
try {
  await maintenance.$executeRawUnsafe(`CREATE DATABASE "${shadowDbName}"`)
  console.log(`Created database "${shadowDbName}".`)
} catch (error) {
  if (error instanceof Error && /already exists/i.test(error.message)) {
    console.log(`Database "${shadowDbName}" already exists, skipping.`)
  } else {
    throw error
  }
} finally {
  await maintenance.$disconnect()
}

// Step 2: create the `auth` schema and the `auth.uid()` stub inside it.
// Uses `prisma db execute` (not PrismaClient's $executeRawUnsafe) because
// that command sends the whole file as a single script, so a multi-statement
// SQL file works; $executeRawUnsafe runs it as one prepared statement and
// rejects multiple commands.
// Invoked as `node <prisma-cli-entry>.js ...` (not the `prisma` shell shim)
// so this works identically on Windows and POSIX without a shell in between.
const sqlFile = join(__dirname, '..', 'prisma', 'sql', 'shadow-bootstrap.sql')
const prismaCliEntry = require.resolve('prisma/build/index.js')
execFileSync(
  process.execPath,
  [prismaCliEntry, 'db', 'execute', '--file', sqlFile, '--url', shadowDatabaseUrl],
  { stdio: 'inherit' },
)
console.log('Applied prisma/sql/shadow-bootstrap.sql.')
