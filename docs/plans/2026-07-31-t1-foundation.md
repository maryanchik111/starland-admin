# Starland Т1 «Каркас» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Робочий монорепо зі схемою БД, моделлю доступів на RLS і вертикальним зрізом адмінки: вхід персоналу → список учнів → профіль учня з режимами перегляду й редагування за дозволами.

**Architecture:** Три Next.js-застосунки (`admin`, `portal`, `api`) над спільними пакетами. Доступ виражається проєкцією `user_effective_scopes`, яку читають і RLS-політики, і доменний шар — одне джерело правди. Політики перевіряють входження в множину, а не викликають функцію на кожен рядок.

**Tech Stack:** pnpm workspaces + Turborepo, TypeScript strict, Next.js 15 (App Router), Prisma, Supabase (Postgres + Auth + Storage), Vitest, `pg` для RLS-тестів, Zod.

## Global Constraints

- Спека: `docs/specs/2026-07-31-starland-design.md`. Правила роботи: `CLAUDE.md`.
- **RLS увімкнено на кожній таблиці**, політики створюються в тій самій міграції, що й таблиця.
- **RLS-політика не викликає функцію з аргументом, що змінюється по рядках.** Тільки `IN (SELECT ...)` / `EXISTS` по `user_effective_scopes`.
- Функції, які читають таблиці доступів, — `STABLE SECURITY DEFINER` з `SET search_path = public`.
- Фізичних видалень немає: `deleted_at` / `revoked_at`.
- Іменування: таблиці `snake_case` у множині, колонки `snake_case`, FK `<entity>_id`, кожна таблиця має `id uuid default gen_random_uuid()`, `created_at`, `updated_at`.
- Мова: код і колонки англійською, UI-тексти українською через `packages/i18n`.
- `any` заборонено. Валідація на межах — Zod.
- Кожна нова таблиця отримує позитивний і негативний RLS-тест.
- Комміти — на кожен крок «Commit» у плані, повідомлення англійською в стилі Conventional Commits.

---

### Task 1: Монорепо, тулінг, git

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `eslint.config.js`, `vitest.workspace.ts`
- Create: `packages/db/package.json`, `packages/domain/package.json`, `packages/i18n/package.json`

**Interfaces:**
- Consumes: нічого
- Produces: робочі команди `pnpm typecheck`, `pnpm lint`, `pnpm test`; workspace-пакети `@starland/db`, `@starland/domain`, `@starland/i18n`

- [ ] **Step 1: Ініціалізувати репозиторій і корінь**

```bash
cd /c/Users/marya/Documents/GitHub/sAdmin
git init
pnpm init
pnpm add -D -w typescript @types/node turbo vitest eslint @eslint/js typescript-eslint prettier
```

- [ ] **Step 2: Створити конфіги**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true
  }
}
```

`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint": {},
    "test": { "dependsOn": ["^build"] }
  }
}
```

Кореневий `package.json` — секція scripts:
```json
{
  "scripts": {
    "typecheck": "turbo typecheck",
    "lint": "turbo lint",
    "test": "turbo test",
    "db:reset": "pnpm --filter @starland/db reset"
  }
}
```

`.gitignore`:
```
node_modules
.next
dist
.env
.env.local
.turbo
supabase/.temp
```

- [ ] **Step 3: Створити порожні пакети**

`packages/db/package.json`:
```json
{
  "name": "@starland/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  }
}
```

Аналогічно `packages/domain` (`@starland/domain`) і `packages/i18n` (`@starland/i18n`). У кожному — `src/index.ts` з рядком `export {}` і `tsconfig.json` з `{"extends": "../../tsconfig.base.json", "include": ["src", "test"]}`.

- [ ] **Step 4: Перевірити, що тулінг працює**

Run: `pnpm install && pnpm typecheck`
Expected: PASS, три пакети без помилок.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: bootstrap pnpm monorepo with turbo, typescript and vitest"
```

---

### Task 2: Локальний Supabase, Prisma і перша міграція

**Files:**
- Create: `supabase/config.toml` (через CLI), `packages/db/prisma/schema.prisma`, `packages/db/src/client.ts`, `packages/db/.env.example`

**Interfaces:**
- Consumes: Task 1
- Produces: змінна `DATABASE_URL`, таблиця `app_users`, експорт `prisma` з `@starland/db`

- [ ] **Step 1: Підняти локальний Supabase**

```bash
pnpm add -D -w supabase
pnpm supabase init
pnpm supabase start
```

Записати `DATABASE_URL` з виводу (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) у `.env` і продублювати імена в `.env.example` без значень.

- [ ] **Step 2: Описати першу таблицю**

`packages/db/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model AppUser {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  authUserId String    @unique @map("auth_user_id") @db.Uuid
  fullName   String    @map("full_name")
  email      String    @unique
  isActive   Boolean   @default(true) @map("is_active")
  deletedAt  DateTime? @map("deleted_at") @db.Timestamptz
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt  DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  @@map("app_users")
}
```

`app_users` — профільна таблиця поверх `auth.users` Supabase. Пароль і сесії лишаються в `auth`, ми зберігаємо лише посилання.

- [ ] **Step 3: Створити міграцію й дописати RLS вручну**

```bash
pnpm --filter @starland/db exec prisma migrate dev --create-only --name init_app_users
```

У згенерований файл `packages/db/prisma/migrations/*_init_app_users/migration.sql` **дописати в кінець**:
```sql
alter table app_users enable row level security;

create policy app_users_self_select on app_users
  for select
  using (auth_user_id = auth.uid());
```

Політика поки мінімальна — розширюється в Task 5, коли зʼявиться проєкція дозволів.

- [ ] **Step 4: Застосувати міграцію**

Run: `pnpm --filter @starland/db exec prisma migrate dev`
Expected: міграція застосована, `prisma generate` відпрацював.

- [ ] **Step 5: Експортувати клієнт**

`packages/db/src/client.ts`:
```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

`packages/db/src/index.ts`:
```ts
export { prisma } from './client.js'
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): add supabase local setup, prisma and app_users table"
```

---

### Task 3: Тестовий стенд для RLS

Це найважливіший інструмент плану. Без нього кожна наступна політика — здогадка.

**Files:**
- Create: `packages/db/test/rls-harness.ts`, `packages/db/test/rls-harness.test.ts`, `packages/db/vitest.config.ts`

**Interfaces:**
- Consumes: Task 2
- Produces: `asUser(userId, fn)`, `asService(fn)`, `createAuthUser(email)` — використовуються в усіх наступних RLS-тестах

- [ ] **Step 1: Написати падаючий тест**

`packages/db/test/rls-harness.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { asService, asUser, createAuthUser } from './rls-harness.js'

describe('rls harness', () => {
  it('shows a user only their own app_users row', async () => {
    const alice = await createAuthUser('alice@starland.test')
    const bob = await createAuthUser('bob@starland.test')

    const rows = await asUser(alice, async (c) => {
      const r = await c.query<{ email: string }>('select email from app_users')
      return r.rows
    })

    expect(rows.map((r) => r.email)).toEqual(['alice@starland.test'])
    expect(rows.map((r) => r.email)).not.toContain('bob@starland.test')
    expect(bob).toBeTruthy()
  })

  it('sees every row when running as service role', async () => {
    await createAuthUser('carol@starland.test')

    const count = await asService(async (c) => {
      const r = await c.query<{ n: string }>('select count(*)::text as n from app_users')
      return Number(r.rows[0]?.n ?? 0)
    })

    expect(count).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Запустити тест і переконатися, що він падає**

Run: `pnpm --filter @starland/db test`
Expected: FAIL — `Cannot find module './rls-harness.js'`

- [ ] **Step 3: Реалізувати стенд**

`packages/db/test/rls-harness.ts`:
```ts
import { Pool, type PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

/** Виконує запити від імені звичайного користувача — RLS діє. */
export async function asUser<T>(authUserId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: authUserId, role: 'authenticated' }),
    ])
    await client.query('set local role authenticated')
    return await fn(client)
  } finally {
    await client.query('rollback')
    client.release()
  }
}

/** Виконує запити в обхід RLS — тільки для підготовки даних у тестах. */
export async function asService<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    return await fn(client)
  } finally {
    await client.query('rollback')
    client.release()
  }
}

/**
 * Створює рядок в auth.users і повʼязаний app_users.
 * Живе поза транзакцією тесту, бо дані потрібні всередині asUser.
 */
export async function createAuthUser(email: string): Promise<string> {
  const authUserId = randomUUID()
  const client = await pool.connect()
  try {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               $2, '', now(), now(), now())`,
      [authUserId, email],
    )
    await client.query(
      `insert into app_users (auth_user_id, full_name, email) values ($1, $2, $3)`,
      [authUserId, email.split('@')[0], email],
    )
    return authUserId
  } finally {
    client.release()
  }
}
```

**Чому `asUser` відкочує транзакцію:** тест не лишає сміття в базі, а `set local` автоматично зникає разом із транзакцією. `createAuthUser` навмисно комітить — інакше дані не буде видно з іншого зʼєднання.

- [ ] **Step 4: Додати очищення між прогонами**

`packages/db/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
})
```

`packages/db/test/global-setup.ts`:
```ts
import { Pool } from 'pg'

export default async function setup() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  await pool.query(`delete from app_users where email like '%@starland.test'`)
  await pool.query(`delete from auth.users where email like '%@starland.test'`)
  await pool.end()
}
```

`fileParallelism: false` — тести ділять одну базу, паралельні файли давали б плаваючі падіння.

- [ ] **Step 5: Запустити тести**

Run: `pnpm --filter @starland/db test`
Expected: PASS, обидва тести.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test(db): add rls test harness with per-user session context"
```

---

### Task 4: Ролі, дозволи, персональні гранти

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/seed/permissions.ts`, `packages/db/prisma/seed/roles.ts`, `packages/db/test/permissions-schema.test.ts`

**Interfaces:**
- Consumes: Task 2, Task 3
- Produces: таблиці `permissions`, `roles`, `role_permissions`, `user_roles`, `permission_grants`; сід із 12 ролями; тип `ScopeKind = 'global' | 'own_teaching' | 'mentor_classes' | 'own_children' | 'self'`

- [ ] **Step 1: Написати падаючий тест на сід**

`packages/db/test/permissions-schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'

describe('permissions seed', () => {
  it('creates every school role', async () => {
    const roles = await prisma.role.findMany({ select: { code: true } })
    expect(roles.map((r) => r.code).sort()).toEqual(
      [
        'admin', 'assistant', 'deputy_director', 'developer', 'director',
        'mentor', 'nurse', 'psychologist', 'secretary', 'speech_therapist',
        'student_family', 'teacher',
      ].sort(),
    )
  })

  it('scopes teacher grade permissions to their own teaching assignments', async () => {
    const rows = await prisma.rolePermission.findMany({
      where: { role: { code: 'teacher' }, permission: { code: 'grades.write' } },
      select: { scopeKind: true },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.scopeKind).toBe('own_teaching')
  })

  it('never gives a family global access to students', async () => {
    const rows = await prisma.rolePermission.findMany({
      where: { role: { code: 'student_family' }, scopeKind: 'global' },
    })
    expect(rows).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Запустити й переконатися, що падає**

Run: `pnpm --filter @starland/db test permissions-schema`
Expected: FAIL — `prisma.role` не існує.

- [ ] **Step 3: Додати моделі в схему**

Дописати в `schema.prisma`:
```prisma
enum ScopeKind {
  global
  own_teaching
  mentor_classes
  own_children
  self

  @@map("scope_kind")
}

enum ScopeType {
  global
  class
  subject
  student
  teaching_assignment
  user

  @@map("scope_type")
}

enum GrantEffect {
  allow
  deny

  @@map("grant_effect")
}

model Permission {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  code        String   @unique
  category    String
  description String
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz

  rolePermissions RolePermission[]
  grants          PermissionGrant[]

  @@map("permissions")
}

model Role {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  code        String   @unique
  name        String
  isSystem    Boolean  @default(false) @map("is_system")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz

  rolePermissions RolePermission[]
  userRoles       UserRole[]

  @@map("roles")
}

model RolePermission {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  roleId       String    @map("role_id") @db.Uuid
  permissionId String    @map("permission_id") @db.Uuid
  scopeKind    ScopeKind @map("scope_kind")
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  role       Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@unique([roleId, permissionId, scopeKind])
  @@map("role_permissions")
}

model UserRole {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  roleId    String   @map("role_id") @db.Uuid
  grantedBy String?  @map("granted_by") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz

  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([userId, roleId])
  @@map("user_roles")
}

model PermissionGrant {
  id           String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId       String      @map("user_id") @db.Uuid
  permissionId String      @map("permission_id") @db.Uuid
  effect       GrantEffect
  scopeType    ScopeType   @map("scope_type")
  scopeId      String?     @map("scope_id") @db.Uuid
  reason       String
  grantedBy    String      @map("granted_by") @db.Uuid
  expiresAt    DateTime?   @map("expires_at") @db.Timestamptz
  revokedAt    DateTime?   @map("revoked_at") @db.Timestamptz
  revokedBy    String?     @map("revoked_by") @db.Uuid
  createdAt    DateTime    @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime    @updatedAt @map("updated_at") @db.Timestamptz

  permission Permission @relation(fields: [permissionId], references: [id])

  @@index([userId, permissionId])
  @@map("permission_grants")
}
```

`reason` і `grantedBy` — **не** nullable. Грант без причини й автора через два роки неможливо пояснити.

- [ ] **Step 4: Створити міграцію з RLS**

```bash
pnpm --filter @starland/db exec prisma migrate dev --create-only --name permissions_model
```

Дописати в кінець згенерованого `migration.sql`:
```sql
alter table permissions      enable row level security;
alter table roles            enable row level security;
alter table role_permissions enable row level security;
alter table user_roles       enable row level security;
alter table permission_grants enable row level security;

-- Довідники дозволів і ролей читає будь-який автентифікований користувач:
-- без цього неможливо намалювати екран «ефективні права».
create policy permissions_read on permissions for select using (auth.uid() is not null);
create policy roles_read on roles for select using (auth.uid() is not null);
create policy role_permissions_read on role_permissions for select using (auth.uid() is not null);

-- Свої ролі й гранти бачить кожен; чужі — лише через політику з Task 5.
create policy user_roles_own on user_roles for select
  using (user_id = (select id from app_users where auth_user_id = auth.uid()));
create policy permission_grants_own on permission_grants for select
  using (user_id = (select id from app_users where auth_user_id = auth.uid()));
```

- [ ] **Step 5: Написати сіди**

`packages/db/prisma/seed/permissions.ts` — масив дозволів:
```ts
export const PERMISSIONS = [
  { code: 'users.read', category: 'users', description: 'Перегляд списку користувачів' },
  { code: 'users.write', category: 'users', description: 'Створення та редагування користувачів' },
  { code: 'roles.manage', category: 'users', description: 'Призначення ролей і видача дозволів' },
  { code: 'students.read', category: 'students', description: 'Перегляд карток учнів' },
  { code: 'students.write', category: 'students', description: 'Редагування карток учнів' },
  { code: 'health.read', category: 'students', description: 'Перегляд структурованих медичних даних' },
  { code: 'health_notes.read', category: 'students', description: 'Перегляд медичних нотаток' },
  { code: 'health.write', category: 'students', description: 'Редагування медичних даних' },
  { code: 'staff.read', category: 'staff', description: 'Перегляд карток персоналу' },
  { code: 'staff.write', category: 'staff', description: 'Редагування карток персоналу' },
  { code: 'classes.read', category: 'school', description: 'Перегляд класів' },
  { code: 'classes.write', category: 'school', description: 'Редагування класів і предметів' },
  { code: 'settings.manage', category: 'school', description: 'Налаштування школи' },
  { code: 'grades.write', category: 'grades', description: 'Виставлення оцінок' },
  { code: 'audit.read', category: 'system', description: 'Перегляд журналу аудиту' },
] as const

export type PermissionCode = (typeof PERMISSIONS)[number]['code']
```

`packages/db/prisma/seed/roles.ts`:
```ts
import type { PermissionCode } from './permissions.js'

type ScopeKind = 'global' | 'own_teaching' | 'mentor_classes' | 'own_children' | 'self'

export const ROLES: Array<{
  code: string
  name: string
  permissions: Array<{ code: PermissionCode; scope: ScopeKind }>
}> = [
  {
    code: 'director',
    name: 'Директор',
    permissions: [
      { code: 'users.read', scope: 'global' },
      { code: 'users.write', scope: 'global' },
      { code: 'roles.manage', scope: 'global' },
      { code: 'students.read', scope: 'global' },
      { code: 'students.write', scope: 'global' },
      { code: 'health.read', scope: 'global' },
      { code: 'staff.read', scope: 'global' },
      { code: 'staff.write', scope: 'global' },
      { code: 'classes.read', scope: 'global' },
      { code: 'classes.write', scope: 'global' },
      { code: 'settings.manage', scope: 'global' },
      { code: 'audit.read', scope: 'global' },
    ],
  },
  {
    code: 'deputy_director',
    name: 'Заступник директора',
    permissions: [
      { code: 'users.read', scope: 'global' },
      { code: 'students.read', scope: 'global' },
      { code: 'students.write', scope: 'global' },
      { code: 'staff.read', scope: 'global' },
      { code: 'classes.read', scope: 'global' },
      { code: 'classes.write', scope: 'global' },
      { code: 'audit.read', scope: 'global' },
    ],
  },
  { code: 'admin', name: 'Адміністратор', permissions: [
    { code: 'users.read', scope: 'global' },
    { code: 'students.read', scope: 'global' },
    { code: 'students.write', scope: 'global' },
    { code: 'staff.read', scope: 'global' },
    { code: 'classes.read', scope: 'global' },
  ] },
  { code: 'secretary', name: 'Секретар', permissions: [
    { code: 'students.read', scope: 'global' },
    { code: 'students.write', scope: 'global' },
    { code: 'classes.read', scope: 'global' },
  ] },
  { code: 'teacher', name: 'Вчитель', permissions: [
    { code: 'students.read', scope: 'own_teaching' },
    { code: 'classes.read', scope: 'own_teaching' },
    { code: 'grades.write', scope: 'own_teaching' },
  ] },
  { code: 'mentor', name: 'Класний керівник', permissions: [
    { code: 'students.read', scope: 'mentor_classes' },
    { code: 'students.write', scope: 'mentor_classes' },
    { code: 'health.read', scope: 'mentor_classes' },
    { code: 'classes.read', scope: 'mentor_classes' },
  ] },
  { code: 'assistant', name: 'Асистент', permissions: [
    { code: 'students.read', scope: 'mentor_classes' },
    { code: 'classes.read', scope: 'mentor_classes' },
  ] },
  { code: 'psychologist', name: 'Психолог', permissions: [
    { code: 'students.read', scope: 'global' },
  ] },
  { code: 'speech_therapist', name: 'Логопед', permissions: [
    { code: 'students.read', scope: 'global' },
  ] },
  { code: 'nurse', name: 'Медсестра', permissions: [
    { code: 'students.read', scope: 'global' },
    { code: 'health.read', scope: 'global' },
    { code: 'health_notes.read', scope: 'global' },
    { code: 'health.write', scope: 'global' },
  ] },
  { code: 'developer', name: 'Розробник', permissions: [
    { code: 'audit.read', scope: 'global' },
  ] },
  { code: 'student_family', name: 'Родина учня', permissions: [
    { code: 'students.read', scope: 'own_children' },
  ] },
]
```

`grades.write` існує раніше за таблиці оцінок — і це навмисно: спершу словник
прав, потім сутності. Інакше додавання журналу в Т2 потягне за собою правку
моделі доступів.

`packages/db/prisma/seed/index.ts`:
```ts
import { prisma } from '../../src/index.js'
import { PERMISSIONS } from './permissions.js'
import { ROLES } from './roles.js'

async function main() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({ where: { code: p.code }, update: p, create: p })
  }

  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, isSystem: true },
      create: { code: r.code, name: r.name, isSystem: true },
    })

    for (const rp of r.permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { code: rp.code } })
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId_scopeKind: {
            roleId: role.id, permissionId: permission.id, scopeKind: rp.scope,
          },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id, scopeKind: rp.scope },
      })
    }
  }
}

main().finally(() => prisma.$disconnect())
```

Додати в `packages/db/package.json`: `"seed": "tsx prisma/seed/index.ts"` і залежність `tsx`.

- [ ] **Step 6: Застосувати й засіяти**

Run: `pnpm --filter @starland/db exec prisma migrate dev && pnpm --filter @starland/db seed`
Expected: міграція застосована, сід відпрацював без помилок.

- [ ] **Step 7: Запустити тести**

Run: `pnpm --filter @starland/db test permissions-schema`
Expected: PASS, три тести.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(db): add roles, permissions and scoped grants with seed data"
```

---

### Task 5: Таблиця ефективних прав і SQL-помічники

Серце моделі доступів. Усе далі спирається на неї.

**Функція перерахунку зʼявиться в Task 9, не тут.** Вона читає
`teaching_assignments`, `classes` і `linked_accounts`, яких на цьому кроці ще
немає, а тригер на `user_roles` упав би на першому ж записі. Тут створюємо
таблицю й помічники, якими користуються всі політики Task 6-8.

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/sql/scope-helpers.sql`, `packages/db/test/scope-helpers.test.ts`

**Interfaces:**
- Consumes: Task 4
- Produces: таблиця `user_effective_scopes(user_id, permission_code, scope_type, scope_id)`, функції `current_app_user_id()` і `has_scope(permission, scope_type, scope_id)`

- [ ] **Step 1: Написати падаючий тест**

`packages/db/test/scope-helpers.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { asUser, createAuthUser } from './rls-harness.js'

describe('scope helpers', () => {
  it('resolves the app user behind the current auth session', async () => {
    const authId = await createAuthUser(`helper-${Date.now()}@starland.test`)
    const expected = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })

    const actual = await asUser(authId, async (c) => {
      const r = await c.query<{ current_app_user_id: string }>('select current_app_user_id()')
      return r.rows[0]?.current_app_user_id
    })

    expect(actual).toBe(expected.id)
  })

  it('reports false when the projection has no matching row', async () => {
    const authId = await createAuthUser(`noscope-${Date.now()}@starland.test`)

    const allowed = await asUser(authId, async (c) => {
      const r = await c.query<{ has_scope: boolean }>(
        `select has_scope('students.read', 'global'::scope_type)`,
      )
      return r.rows[0]?.has_scope
    })

    expect(allowed).toBe(false)
  })

  it('reports true once a matching scope row exists', async () => {
    const authId = await createAuthUser(`scoped-${Date.now()}@starland.test`)
    const user = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })
    await prisma.$executeRaw`
      insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id)
      values (${user.id}::uuid, 'students.read', 'global'::scope_type, null)
    `

    const allowed = await asUser(authId, async (c) => {
      const r = await c.query<{ has_scope: boolean }>(
        `select has_scope('students.read', 'global'::scope_type)`,
      )
      return r.rows[0]?.has_scope
    })

    expect(allowed).toBe(true)
  })
})
```

- [ ] **Step 2: Запустити й переконатися, що падає**

Run: `pnpm --filter @starland/db test scope-helpers`
Expected: FAIL — relation `user_effective_scopes` does not exist.

- [ ] **Step 3: Додати модель проєкції**

```prisma
model UserEffectiveScope {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId         String    @map("user_id") @db.Uuid
  permissionCode String    @map("permission_code")
  scopeType      ScopeType @map("scope_type")
  scopeId        String?   @map("scope_id") @db.Uuid
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  @@unique([userId, permissionCode, scopeType, scopeId])
  @@index([userId, permissionCode, scopeType])
  @@map("user_effective_scopes")
}
```

Індекс `(user_id, permission_code, scope_type)` — саме той, яким користуються всі RLS-політики.

- [ ] **Step 4: Написати SQL-помічники**

`packages/db/prisma/sql/scope-helpers.sql`:
```sql
create or replace function current_app_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from app_users where auth_user_id = auth.uid()
$$;

create or replace function has_scope(
  p_permission text,
  p_scope_type scope_type,
  p_scope_id uuid default null
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_effective_scopes s
    where s.user_id = current_app_user_id()
      and s.permission_code = p_permission
      and s.scope_type = p_scope_type
      and (p_scope_id is null or s.scope_id = p_scope_id)
  )
$$;
```

`security definer` тут обовʼязковий: функція читає `user_effective_scopes`, на
якій увімкнено RLS, і без нього побачила б лише власні рядки викликаючого — що
для глобальної перевірки прав дало б хибний результат.

`has_scope` придатний для політик з **фіксованим** скоупом (`global`). Там, де
скоуп змінюється по рядках, політика пишеться через `IN (SELECT ...)` — див.
Task 6 і Task 7.

- [ ] **Step 5: Створити міграцію**

```bash
pnpm --filter @starland/db exec prisma migrate dev --create-only --name user_effective_scopes
```

У згенерований `migration.sql` дописати вміст `scope-helpers.sql` **і** політику:
```sql
alter table user_effective_scopes enable row level security;

create policy user_effective_scopes_own on user_effective_scopes
  for select
  using (user_id = (select id from app_users where auth_user_id = auth.uid()));
```

Політика навмисно не використовує `has_scope` — інакше функція викликала б саму
себе через таблицю, яку ця ж політика й захищає.

- [ ] **Step 6: Застосувати й запустити тести**

Run: `pnpm --filter @starland/db exec prisma migrate dev && pnpm --filter @starland/db test scope-helpers`
Expected: PASS, три тести.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): add effective scopes table and permission helper functions"
```

---

## Додаток А: перерахунок ефективних прав

Цей SQL створюється **міграцією з Task 9**, коли вже існують `teaching_assignments`,
`classes` і `linked_accounts`. Він винесений окремо, бо на нього посилається саме
Task 9, а логічно він належить до моделі доступів із Task 5.

```sql
create or replace function refresh_user_effective_scopes(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from user_effective_scopes where user_id = p_user_id;

  -- 1. Глобальні дозволи з ролей
  insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id)
  select distinct ur.user_id, p.code, 'global'::scope_type, null
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  join permissions p on p.id = rp.permission_id
  where ur.user_id = p_user_id and rp.scope_kind = 'global';

  -- 2. Дозволи в межах власних пар предмет+клас
  insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id)
  select distinct ur.user_id, p.code, 'teaching_assignment'::scope_type, ta.id
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  join permissions p on p.id = rp.permission_id
  join teaching_assignments ta on ta.teacher_user_id = ur.user_id and ta.deleted_at is null
  where ur.user_id = p_user_id and rp.scope_kind = 'own_teaching';

  -- 3. Дозволи класного керівника на свій клас
  insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id)
  select distinct ur.user_id, p.code, 'class'::scope_type, c.id
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  join permissions p on p.id = rp.permission_id
  join classes c on c.mentor_user_id = ur.user_id and c.deleted_at is null
  where ur.user_id = p_user_id and rp.scope_kind = 'mentor_classes';

  -- 4. Дозволи родини на своїх дітей
  insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id)
  select distinct ur.user_id, p.code, 'student'::scope_type, la.student_id
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  join permissions p on p.id = rp.permission_id
  join linked_accounts la on la.owner_user_id = ur.user_id
  where ur.user_id = p_user_id and rp.scope_kind = 'own_children';

  -- 5. Персональні дозволи «allow»
  insert into user_effective_scopes (user_id, permission_code, scope_type, scope_id)
  select distinct g.user_id, p.code, g.scope_type, g.scope_id
  from permission_grants g
  join permissions p on p.id = g.permission_id
  where g.user_id = p_user_id
    and g.effect = 'allow'
    and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > now())
  on conflict do nothing;

  -- 6. Персональні заборони знімають усе, що збіглося
  delete from user_effective_scopes ues
  using permission_grants g
  join permissions p on p.id = g.permission_id
  where ues.user_id = p_user_id
    and g.user_id = p_user_id
    and g.effect = 'deny'
    and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > now())
    and ues.permission_code = p.code
    and (
      g.scope_type = 'global'
      or (ues.scope_type = g.scope_type and ues.scope_id is not distinct from g.scope_id)
    );
end;
$$;

-- Тригерна обгортка: визначає, чийого користувача чіпали
create or replace function trg_refresh_scopes_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected uuid;
begin
  affected := coalesce(
    case tg_op when 'DELETE' then old.user_id else new.user_id end,
    null
  );
  if affected is not null then
    perform refresh_user_effective_scopes(affected);
  end if;
  return null;
end;
$$;

create trigger user_roles_refresh_scopes
  after insert or update or delete on user_roles
  for each row execute function trg_refresh_scopes_for_user();

create trigger permission_grants_refresh_scopes
  after insert or update or delete on permission_grants
  for each row execute function trg_refresh_scopes_for_user();

-- Гранти з терміном дії протухають самі по собі; проєкція про це не дізнається,
-- поки її не перерахують. Викликається нічним cron у Т3.
create or replace function refresh_expired_grants()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_user uuid;
  n integer := 0;
begin
  for affected_user in
    select distinct user_id from permission_grants
    where expires_at is not null and expires_at <= now() and revoked_at is null
  loop
    perform refresh_user_effective_scopes(affected_user);
    n := n + 1;
  end loop;
  return n;
end;
$$;
```

**Чому `security definer`:** функція читає `user_roles` і `permission_grants`, на яких увімкнено RLS. Без `definer` вона побачила б лише рядки поточного користувача й порахувала б неправильно.

Після створення тригерів у тій самій міграції — разовий backfill для вже наявних
користувачів, інакше проєкція лишиться порожньою до першої зміни ролей:

```sql
select refresh_user_effective_scopes(id) from app_users;
```

---

### Task 6: Структура школи

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/test/school-structure.test.ts`

**Interfaces:**
- Consumes: Task 4
- Produces: `academic_years`, `academic_periods`, `classes` (з `mentor_user_id`), `subjects`, `rooms`, `bell_slots`, `academic_calendar`

- [ ] **Step 1: Написати падаючий тест**

`packages/db/test/school-structure.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'

describe('school structure', () => {
  it('rejects two classes with the same name in one academic year', async () => {
    const year = await prisma.academicYear.create({
      data: { name: '2026/2027', startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
    })
    await prisma.class.create({ data: { academicYearId: year.id, gradeLevel: 5, name: '5-А' } })

    await expect(
      prisma.class.create({ data: { academicYearId: year.id, gradeLevel: 5, name: '5-А' } }),
    ).rejects.toThrow()
  })

  it('marks calendar days as non-teaching', async () => {
    const year = await prisma.academicYear.create({
      data: { name: '2027/2028', startsOn: new Date('2027-09-01'), endsOn: new Date('2028-06-30') },
    })
    const day = await prisma.academicCalendarDay.create({
      data: { academicYearId: year.id, date: new Date('2027-10-26'), kind: 'holiday', title: 'Осінні канікули' },
    })

    expect(day.isTeachingDay).toBe(false)
  })
})
```

- [ ] **Step 2: Запустити й переконатися, що падає**

Run: `pnpm --filter @starland/db test school-structure`
Expected: FAIL — `prisma.academicYear` не існує.

- [ ] **Step 3: Додати моделі**

```prisma
enum CalendarDayKind {
  holiday
  vacation
  remote
  exam

  @@map("calendar_day_kind")
}

model AcademicYear {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String    @unique
  startsOn  DateTime  @map("starts_on") @db.Date
  endsOn    DateTime  @map("ends_on") @db.Date
  isCurrent Boolean   @default(false) @map("is_current")
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  periods  AcademicPeriod[]
  classes  Class[]
  calendar AcademicCalendarDay[]

  @@map("academic_years")
}

model AcademicPeriod {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  academicYearId String   @map("academic_year_id") @db.Uuid
  name           String
  ordinal        Int
  startsOn       DateTime @map("starts_on") @db.Date
  endsOn         DateTime @map("ends_on") @db.Date
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz

  academicYear AcademicYear @relation(fields: [academicYearId], references: [id])

  @@unique([academicYearId, ordinal])
  @@map("academic_periods")
}

model Class {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  academicYearId String    @map("academic_year_id") @db.Uuid
  gradeLevel     Int       @map("grade_level")
  name           String
  mentorUserId   String?   @map("mentor_user_id") @db.Uuid
  assistantUserId String?  @map("assistant_user_id") @db.Uuid
  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  academicYear AcademicYear @relation(fields: [academicYearId], references: [id])
  enrollments  Enrollment[]
  assignments  TeachingAssignment[]

  @@unique([academicYearId, name])
  @@index([mentorUserId])
  @@map("classes")
}

model Subject {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  code      String    @unique
  name      String
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  assignments TeachingAssignment[]

  @@map("subjects")
}

model Room {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String    @unique
  capacity  Int?
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  @@map("rooms")
}

model BellSlot {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ordinal    Int
  startsAt   String   @map("starts_at") @db.VarChar(5)
  endsAt     String   @map("ends_at") @db.VarChar(5)
  gradeLevel Int?     @map("grade_level")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz

  @@unique([ordinal, gradeLevel])
  @@map("bell_slots")
}

model AcademicCalendarDay {
  id             String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  academicYearId String          @map("academic_year_id") @db.Uuid
  date           DateTime        @db.Date
  kind           CalendarDayKind
  title          String
  isTeachingDay  Boolean         @default(false) @map("is_teaching_day")
  createdAt      DateTime        @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime        @updatedAt @map("updated_at") @db.Timestamptz

  academicYear AcademicYear @relation(fields: [academicYearId], references: [id])

  @@unique([academicYearId, date])
  @@map("academic_calendar")
}
```

`bellSlot.gradeLevel` nullable: `null` означає загальношкільний розклад дзвінків, а заповнений — окремий для 1 класу з коротшими уроками.

- [ ] **Step 4: Міграція з RLS**

```bash
pnpm --filter @starland/db exec prisma migrate dev --create-only --name school_structure
```

Дописати в `migration.sql`:
```sql
alter table academic_years     enable row level security;
alter table academic_periods   enable row level security;
alter table classes            enable row level security;
alter table subjects           enable row level security;
alter table rooms              enable row level security;
alter table bell_slots         enable row level security;
alter table academic_calendar  enable row level security;

-- Календарні довідники читає будь-який автентифікований користувач.
create policy academic_years_read    on academic_years    for select using (auth.uid() is not null);
create policy academic_periods_read  on academic_periods  for select using (auth.uid() is not null);
create policy subjects_read          on subjects          for select using (auth.uid() is not null);
create policy rooms_read             on rooms             for select using (auth.uid() is not null);
create policy bell_slots_read        on bell_slots        for select using (auth.uid() is not null);
create policy academic_calendar_read on academic_calendar for select using (auth.uid() is not null);

-- Класи: глобальний дозвіл або власний клас класного керівника.
-- Гілку «свої пари предмет+клас» додає Task 9, коли зʼявиться
-- taблиця teaching_assignments — політика не може посилатись на неї раніше.
create policy classes_read on classes
  for select
  using (
    has_scope('classes.read', 'global')
    or id in (
      select s.scope_id from user_effective_scopes s
      where s.user_id = current_app_user_id()
        and s.permission_code = 'classes.read'
        and s.scope_type = 'class'
    )
  );
```

Жоден підзапит не залежить від поточного рядка — планувальник обчислює їх один раз.

- [ ] **Step 5: Застосувати й запустити тести**

Run: `pnpm --filter @starland/db exec prisma migrate dev && pnpm --filter @starland/db test school-structure`
Expected: PASS, два тести.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): add academic years, classes, subjects, rooms and calendar"
```

---

### Task 7: Учні, опікуни, зарахування, картки

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/test/students.test.ts`

**Interfaces:**
- Consumes: Task 6
- Produces: `students`, `guardian_persons`, `guardianships`, `enrollments`, `person_cards`, `student_measurements`, `linked_accounts`

- [ ] **Step 1: Написати падаючий тест**

`packages/db/test/students.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'

async function makeClass(name: string) {
  const year = await prisma.academicYear.create({
    data: { name: `Y-${name}-${Date.now()}`, startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
  })
  return prisma.class.create({ data: { academicYearId: year.id, gradeLevel: 5, name } })
}

describe('students', () => {
  it('keeps enrollment history when a student changes class', async () => {
    const from = await makeClass('5-А')
    const to = await makeClass('5-Б')
    const student = await prisma.student.create({
      data: { firstName: 'Іван', lastName: 'Петренко', bornOn: new Date('2015-04-12') },
    })

    await prisma.enrollment.create({
      data: { studentId: student.id, classId: from.id, fromDate: new Date('2026-09-01'), toDate: new Date('2026-12-20') },
    })
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: to.id, fromDate: new Date('2027-01-10') },
    })

    const history = await prisma.enrollment.findMany({ where: { studentId: student.id } })
    expect(history).toHaveLength(2)
  })

  it('refuses to bind one qr code to two people at the same time', async () => {
    const a = await prisma.student.create({
      data: { firstName: 'Олена', lastName: 'Коваль', bornOn: new Date('2015-01-01') },
    })
    const b = await prisma.student.create({
      data: { firstName: 'Марія', lastName: 'Коваль', bornOn: new Date('2016-01-01') },
    })

    await prisma.personCard.create({
      data: { studentId: a.id, qrCode: 'STL-DUP-1', validFrom: new Date('2026-09-01') },
    })

    await expect(
      prisma.personCard.create({
        data: { studentId: b.id, qrCode: 'STL-DUP-1', validFrom: new Date('2026-09-01') },
      }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Запустити й переконатися, що падає**

Run: `pnpm --filter @starland/db test students`
Expected: FAIL — `prisma.student` не існує.

- [ ] **Step 3: Додати моделі**

```prisma
model Student {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  firstName    String    @map("first_name")
  lastName     String    @map("last_name")
  middleName   String?   @map("middle_name")
  bornOn       DateTime  @map("born_on") @db.Date
  livingAddress String?  @map("living_address")
  criticalNote String?   @map("critical_note")
  parentalConsentGivenAt DateTime? @map("parental_consent_given_at") @db.Date
  parentalConsentEnteredBy String?  @map("parental_consent_entered_by") @db.Uuid
  deletedAt    DateTime? @map("deleted_at") @db.Timestamptz
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  enrollments   Enrollment[]
  guardianships Guardianship[]
  cards         PersonCard[]
  measurements  StudentMeasurement[]

  @@index([lastName, firstName])
  @@map("students")
}

model GuardianPerson {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  firstName String    @map("first_name")
  lastName  String    @map("last_name")
  middleName String?  @map("middle_name")
  phone     String?
  email     String?
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  guardianships Guardianship[]

  @@map("guardian_persons")
}

model Guardianship {
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  studentId            String   @map("student_id") @db.Uuid
  personId             String   @map("person_id") @db.Uuid
  relation             String
  isLegalRepresentative Boolean @default(false) @map("is_legal_representative")
  canPickUp            Boolean  @default(true) @map("can_pick_up")
  receivesNotifications Boolean @default(true) @map("receives_notifications")
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt            DateTime @updatedAt @map("updated_at") @db.Timestamptz

  student Student        @relation(fields: [studentId], references: [id])
  person  GuardianPerson @relation(fields: [personId], references: [id])

  @@unique([studentId, personId])
  @@map("guardianships")
}

model Enrollment {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  studentId String    @map("student_id") @db.Uuid
  classId   String    @map("class_id") @db.Uuid
  fromDate  DateTime  @map("from_date") @db.Date
  toDate    DateTime? @map("to_date") @db.Date
  status    String    @default("active")
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  student Student @relation(fields: [studentId], references: [id])
  class   Class   @relation(fields: [classId], references: [id])

  @@index([classId, toDate])
  @@index([studentId])
  @@map("enrollments")
}

model PersonCard {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  studentId String?   @map("student_id") @db.Uuid
  staffUserId String? @map("staff_user_id") @db.Uuid
  qrCode    String    @map("qr_code")
  validFrom DateTime  @map("valid_from") @db.Date
  validTo   DateTime? @map("valid_to") @db.Date
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  student Student? @relation(fields: [studentId], references: [id])

  @@index([qrCode])
  @@map("person_cards")
}

model StudentMeasurement {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  studentId  String   @map("student_id") @db.Uuid
  measuredOn DateTime @map("measured_on") @db.Date
  heightCm   Int?     @map("height_cm")
  weightKg   Decimal? @map("weight_kg") @db.Decimal(5, 2)
  enteredBy  String   @map("entered_by") @db.Uuid
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz

  student Student @relation(fields: [studentId], references: [id])

  @@unique([studentId, measuredOn])
  @@map("student_measurements")
}

model LinkedAccount {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ownerUserId  String   @map("owner_user_id") @db.Uuid
  studentId    String   @map("student_id") @db.Uuid
  linkedBy     String   @map("linked_by") @db.Uuid
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz

  @@unique([ownerUserId, studentId])
  @@map("linked_accounts")
}
```

- [ ] **Step 4: Міграція з унікальністю картки й RLS**

```bash
pnpm --filter @starland/db exec prisma migrate dev --create-only --name students_and_guardians
```

Дописати:
```sql
-- Один QR не може одночасно належати двом людям.
-- Частковий унікальний індекс: діють лише активні привʼязки.
create unique index person_cards_active_qr on person_cards (qr_code) where valid_to is null;

alter table students             enable row level security;
alter table guardian_persons     enable row level security;
alter table guardianships        enable row level security;
alter table enrollments          enable row level security;
alter table person_cards         enable row level security;
alter table student_measurements enable row level security;
alter table linked_accounts      enable row level security;

-- Гілку «учні з моїх пар предмет+клас» додає Task 9 разом із таблицею
-- teaching_assignments. Тут — глобальний доступ, свої діти, свій клас.
create policy students_read on students
  for select
  using (
    has_scope('students.read', 'global')
    or id in (
      select s.scope_id from user_effective_scopes s
      where s.user_id = current_app_user_id()
        and s.permission_code = 'students.read'
        and s.scope_type = 'student'
    )
    or id in (
      select e.student_id from enrollments e
      where e.to_date is null
        and e.class_id in (
          select s.scope_id from user_effective_scopes s
          where s.user_id = current_app_user_id()
            and s.permission_code = 'students.read'
            and s.scope_type = 'class'
        )
    )
  );

create policy linked_accounts_own on linked_accounts
  for select
  using (owner_user_id = (select id from app_users where auth_user_id = auth.uid()));
```

Частковий індекс `where valid_to is null` — саме те, що дозволяє перевипустити картку: стара привʼязка отримує `valid_to`, і номер звільняється.

- [ ] **Step 5: Застосувати й запустити тести**

Run: `pnpm --filter @starland/db exec prisma migrate dev && pnpm --filter @starland/db test students`
Expected: PASS, два тести.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): add students, guardians, enrollments and person cards"
```

---

### Task 8: Медичні дані з двома рівнями доступу

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/sql/health_notes.sql`, `packages/db/test/health-access.test.ts`

**Interfaces:**
- Consumes: Task 7, Task 5 (`current_app_user_id()`, `has_scope()`)
- Produces: `student_health`, `student_health_notes` (шифрована), `sensitive_access_logs`, функції `read_health_note(uuid)`, `write_health_note(uuid, text)`

- [ ] **Step 1: Написати падаючий тест**

`packages/db/test/health-access.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { asUser, createAuthUser } from './rls-harness.js'

async function makeUserWithRole(email: string, roleCode: string) {
  const authId = await createAuthUser(email)
  const user = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } })
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } })
  return { authId, userId: user.id }
}

describe('health notes', () => {
  it('lets a nurse read the note and logs the access', async () => {
    const nurse = await makeUserWithRole(`nurse-${Date.now()}@starland.test`, 'nurse')
    const student = await prisma.student.create({
      data: { firstName: 'Тарас', lastName: 'Шевченко', bornOn: new Date('2014-03-09') },
    })
    await prisma.$executeRaw`select write_health_note(${student.id}::uuid, 'Астма, інгалятор у медкабінеті')`

    const note = await asUser(nurse.authId, async (c) => {
      const r = await c.query<{ read_health_note: string }>(
        'select read_health_note($1::uuid)', [student.id],
      )
      return r.rows[0]?.read_health_note
    })

    expect(note).toBe('Астма, інгалятор у медкабінеті')

    const logs = await prisma.sensitiveAccessLog.findMany({
      where: { userId: nurse.userId, entityId: student.id },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.entityType).toBe('student_health_note')
  })

  it('refuses to return the note to a secretary', async () => {
    const secretary = await makeUserWithRole(`secretary-${Date.now()}@starland.test`, 'secretary')
    const student = await prisma.student.create({
      data: { firstName: 'Леся', lastName: 'Українка', bornOn: new Date('2014-02-25') },
    })
    await prisma.$executeRaw`select write_health_note(${student.id}::uuid, 'Алергія на пеніцилін')`

    await expect(
      asUser(secretary.authId, async (c) => c.query('select read_health_note($1::uuid)', [student.id])),
    ).rejects.toThrow(/insufficient_permission/)
  })
})
```

- [ ] **Step 2: Запустити й переконатися, що падає**

Run: `pnpm --filter @starland/db test health-access`
Expected: FAIL — функція `write_health_note` не існує.

- [ ] **Step 3: Додати моделі**

```prisma
model StudentHealth {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  studentId      String    @unique @map("student_id") @db.Uuid
  healthGroup    String?   @map("health_group")
  peGroup        String?   @map("pe_group")
  allergyCodes   String[]  @map("allergy_codes")
  chronicCodes   String[]  @map("chronic_codes")
  activityLimits String?   @map("activity_limits")
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  @@map("student_health")
}

model StudentHealthNote {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  studentId     String   @unique @map("student_id") @db.Uuid
  contentCipher Bytes    @map("content_cipher")
  updatedBy     String?  @map("updated_by") @db.Uuid
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz

  @@map("student_health_notes")
}

model SensitiveAccessLog {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  entityType String   @map("entity_type")
  entityId   String   @map("entity_id") @db.Uuid
  action     String
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@index([entityType, entityId])
  @@index([userId, createdAt])
  @@map("sensitive_access_logs")
}
```

`allergyCodes` і `chronicCodes` — масиви кодів **без шифрування**: за ними потрібні фільтри й звіти. Шифрується лише вільний текст нотатки.

- [ ] **Step 4: Написати функції доступу**

`packages/db/prisma/sql/health_notes.sql`:
```sql
create extension if not exists pgcrypto;

-- Ключ читається з налаштування бази, а не зберігається в ній.
-- Локально задається через: alter database postgres set app.health_key = '...';
-- На проді значення приходить із Supabase Vault.
create or replace function health_key() returns text
language sql stable as $$ select current_setting('app.health_key', false) $$;

-- current_app_user_id() і has_scope() вже створені міграцією з Task 5.

create or replace function read_health_note(p_student_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  result text;
begin
  if not has_scope('health_notes.read', 'global') then
    raise exception 'insufficient_permission' using errcode = '42501';
  end if;

  select pgp_sym_decrypt(content_cipher, health_key())
  into result
  from student_health_notes
  where student_id = p_student_id;

  insert into sensitive_access_logs (user_id, entity_type, entity_id, action)
  values (current_app_user_id(), 'student_health_note', p_student_id, 'read');

  return result;
end;
$$;

create or replace function write_health_note(p_student_id uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into student_health_notes (student_id, content_cipher, updated_by)
  values (p_student_id, pgp_sym_encrypt(p_content, health_key()), current_app_user_id())
  on conflict (student_id) do update
    set content_cipher = excluded.content_cipher,
        updated_by = excluded.updated_by,
        updated_at = now();

  insert into sensitive_access_logs (user_id, entity_type, entity_id, action)
  values (current_app_user_id(), 'student_health_note', p_student_id, 'write');
end;
$$;
```

**Чому читання йде через функцію, а не через `select` по таблиці:** лог на читання неможливо забезпечити політикою RLS — політика фільтрує, але не записує. Функція — єдине місце, де читання й лог відбуваються разом.

- [ ] **Step 5: Міграція**

```bash
pnpm --filter @starland/db exec prisma migrate dev --create-only --name health_data
```

Дописати вміст `health_notes.sql` плюс:
```sql
alter table student_health       enable row level security;
alter table student_health_notes enable row level security;
alter table sensitive_access_logs enable row level security;

-- Пряме читання зашифрованої таблиці заборонене всім: тільки через read_health_note().
create policy student_health_notes_no_direct_read on student_health_notes
  for select using (false);

create policy student_health_read on student_health
  for select using (has_scope('health.read', 'global'));

create policy sensitive_logs_read on sensitive_access_logs
  for select using (has_scope('audit.read', 'global'));
```

Локально задати ключ:
```bash
psql "$DATABASE_URL" -c "alter database postgres set app.health_key = 'local-dev-key-not-for-production'"
```

- [ ] **Step 6: Застосувати й запустити тести**

Run: `pnpm --filter @starland/db exec prisma migrate dev && pnpm --filter @starland/db test health-access`
Expected: PASS, два тести.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): add encrypted health notes with access logging"
```

---

### Task 9: Персонал і навчальні призначення

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/test/teaching-scopes.test.ts`, `packages/db/test/effective-scopes.test.ts`

**Interfaces:**
- Consumes: Task 5 (таблиця проєкції), Task 6, Task 7, Додаток А
- Produces: `staff_profiles`, `staff_awards`, `teaching_assignments`, функції `refresh_user_effective_scopes(uuid)` і `refresh_expired_grants()`, чотири тригери перерахунку проєкції

- [ ] **Step 1: Написати падаючий тест**

`packages/db/test/teaching-scopes.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { asUser, createAuthUser } from './rls-harness.js'

describe('teacher scope', () => {
  it('shows a teacher only students from their own class', async () => {
    const authId = await createAuthUser(`teacher-${Date.now()}@starland.test`)
    const teacher = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'teacher' } })

    const year = await prisma.academicYear.create({
      data: { name: `Y-${Date.now()}`, startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
    })
    const period = await prisma.academicPeriod.create({
      data: { academicYearId: year.id, name: 'I семестр', ordinal: 1,
              startsOn: new Date('2026-09-01'), endsOn: new Date('2026-12-28') },
    })
    const mine = await prisma.class.create({ data: { academicYearId: year.id, gradeLevel: 6, name: '6-А' } })
    const other = await prisma.class.create({ data: { academicYearId: year.id, gradeLevel: 6, name: '6-Б' } })
    const subject = await prisma.subject.create({ data: { code: `math-${Date.now()}`, name: 'Математика' } })

    const inMyClass = await prisma.student.create({
      data: { firstName: 'Мій', lastName: 'Учень', bornOn: new Date('2014-01-01') },
    })
    const elsewhere = await prisma.student.create({
      data: { firstName: 'Чужий', lastName: 'Учень', bornOn: new Date('2014-01-01') },
    })
    await prisma.enrollment.create({
      data: { studentId: inMyClass.id, classId: mine.id, fromDate: new Date('2026-09-01') },
    })
    await prisma.enrollment.create({
      data: { studentId: elsewhere.id, classId: other.id, fromDate: new Date('2026-09-01') },
    })

    // Спершу призначення, потім роль — щоб перевірити, що тригер бачить обидва джерела.
    await prisma.teachingAssignment.create({
      data: { teacherUserId: teacher.id, subjectId: subject.id, classId: mine.id, periodId: period.id },
    })
    await prisma.userRole.create({ data: { userId: teacher.id, roleId: role.id } })

    const visible = await asUser(authId, async (c) => {
      const r = await c.query<{ last_name: string; first_name: string }>(
        'select first_name, last_name from students',
      )
      return r.rows
    })

    expect(visible.map((s) => s.first_name)).toContain('Мій')
    expect(visible.map((s) => s.first_name)).not.toContain('Чужий')
  })
})
```

- [ ] **Step 2: Запустити й переконатися, що падає**

Run: `pnpm --filter @starland/db test teaching-scopes`
Expected: FAIL — `prisma.teachingAssignment` не існує.

- [ ] **Step 3: Додати моделі**

```prisma
model StaffProfile {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId        String    @unique @map("user_id") @db.Uuid
  phone         String?
  category      String?
  experienceYears Int?    @map("experience_years")
  position      String?
  deletedAt     DateTime? @map("deleted_at") @db.Timestamptz
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  awards StaffAward[]

  @@map("staff_profiles")
}

model StaffAward {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  profileId String   @map("profile_id") @db.Uuid
  title     String
  awardedOn DateTime @map("awarded_on") @db.Date
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz

  profile StaffProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@map("staff_awards")
}

model TeachingAssignment {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  teacherUserId String    @map("teacher_user_id") @db.Uuid
  subjectId     String    @map("subject_id") @db.Uuid
  classId       String    @map("class_id") @db.Uuid
  periodId      String    @map("period_id") @db.Uuid
  deletedAt     DateTime? @map("deleted_at") @db.Timestamptz
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  subject Subject @relation(fields: [subjectId], references: [id])
  class   Class   @relation(fields: [classId], references: [id])

  @@unique([teacherUserId, subjectId, classId, periodId])
  @@index([teacherUserId])
  @@map("teaching_assignments")
}
```

- [ ] **Step 4: Міграція з тригером на призначення**

```bash
pnpm --filter @starland/db exec prisma migrate dev --create-only --name staff_and_assignments
```

Дописати:
```sql
alter table staff_profiles       enable row level security;
alter table staff_awards         enable row level security;
alter table teaching_assignments enable row level security;

create policy staff_profiles_read on staff_profiles
  for select using (has_scope('staff.read', 'global') or user_id = current_app_user_id());

create policy staff_awards_read on staff_awards
  for select using (has_scope('staff.read', 'global'));

create policy teaching_assignments_read on teaching_assignments
  for select using (has_scope('staff.read', 'global') or teacher_user_id = current_app_user_id());

-- Тепер існують усі таблиці-джерела, тому створюємо перерахунок проєкції.
-- Сюди дослівно копіюється весь SQL із «Додатка А» цього плану:
-- refresh_user_effective_scopes(), trg_refresh_scopes_for_user(),
-- тригери user_roles_refresh_scopes і permission_grants_refresh_scopes,
-- refresh_expired_grants().

-- Зміна призначень і класного керівництва теж змінює ефективні права.
create or replace function trg_refresh_scopes_for_teacher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then
    perform refresh_user_effective_scopes(old.teacher_user_id);
  end if;
  if tg_op <> 'DELETE' then
    perform refresh_user_effective_scopes(new.teacher_user_id);
  end if;
  return null;
end;
$$;

create trigger teaching_assignments_refresh_scopes
  after insert or update or delete on teaching_assignments
  for each row execute function trg_refresh_scopes_for_teacher();

create or replace function trg_refresh_scopes_for_mentor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' and old.mentor_user_id is not null then
    perform refresh_user_effective_scopes(old.mentor_user_id);
  end if;
  if tg_op <> 'DELETE' and new.mentor_user_id is not null then
    perform refresh_user_effective_scopes(new.mentor_user_id);
  end if;
  return null;
end;
$$;

create trigger classes_refresh_mentor_scopes
  after insert or update or delete on classes
  for each row execute function trg_refresh_scopes_for_mentor();

-- Тепер, коли teaching_assignments існує, розширюємо політики з Task 6 і Task 7
-- гілкою «свої пари предмет+клас». Postgres не має CREATE OR REPLACE POLICY,
-- тому drop + create.
drop policy classes_read on classes;
create policy classes_read on classes
  for select
  using (
    has_scope('classes.read', 'global')
    or id in (
      select s.scope_id from user_effective_scopes s
      where s.user_id = current_app_user_id()
        and s.permission_code = 'classes.read'
        and s.scope_type = 'class'
    )
    or id in (
      select ta.class_id from teaching_assignments ta
      where ta.deleted_at is null
        and ta.id in (
          select s.scope_id from user_effective_scopes s
          where s.user_id = current_app_user_id()
            and s.permission_code = 'classes.read'
            and s.scope_type = 'teaching_assignment'
        )
    )
  );

drop policy students_read on students;
create policy students_read on students
  for select
  using (
    has_scope('students.read', 'global')
    or id in (
      select s.scope_id from user_effective_scopes s
      where s.user_id = current_app_user_id()
        and s.permission_code = 'students.read'
        and s.scope_type = 'student'
    )
    or id in (
      select e.student_id from enrollments e
      where e.to_date is null
        and e.class_id in (
          select s.scope_id from user_effective_scopes s
          where s.user_id = current_app_user_id()
            and s.permission_code = 'students.read'
            and s.scope_type = 'class'
        )
    )
    or id in (
      select e.student_id from enrollments e
      where e.to_date is null
        and e.class_id in (
          select ta.class_id from teaching_assignments ta
          where ta.deleted_at is null
            and ta.id in (
              select s.scope_id from user_effective_scopes s
              where s.user_id = current_app_user_id()
                and s.permission_code = 'students.read'
                and s.scope_type = 'teaching_assignment'
            )
        )
    )
  );
```

- [ ] **Step 5: Написати тести на поведінку проєкції**

`packages/db/test/effective-scopes.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { createAuthUser } from './rls-harness.js'

async function scopesOf(userId: string) {
  return prisma.$queryRaw<Array<{ permission_code: string; scope_type: string }>>`
    select permission_code, scope_type from user_effective_scopes where user_id = ${userId}::uuid
  `
}

describe('user_effective_scopes', () => {
  let directorUserId: string

  beforeEach(async () => {
    const authId = await createAuthUser(`director-${Date.now()}@starland.test`)
    directorUserId = (await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })).id
  })

  it('expands a global role into global scopes', async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'director' } })
    await prisma.userRole.create({ data: { userId: directorUserId, roleId: role.id } })

    const scopes = await scopesOf(directorUserId)
    expect(scopes.some((s) => s.permission_code === 'students.read' && s.scope_type === 'global')).toBe(true)
  })

  it('removes scopes when the role is taken away', async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'director' } })
    const link = await prisma.userRole.create({ data: { userId: directorUserId, roleId: role.id } })
    await prisma.userRole.delete({ where: { id: link.id } })

    expect(await scopesOf(directorUserId)).toHaveLength(0)
  })

  it('lets a deny grant override an allow from a role', async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'director' } })
    await prisma.userRole.create({ data: { userId: directorUserId, roleId: role.id } })
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code: 'audit.read' } })

    await prisma.permissionGrant.create({
      data: {
        userId: directorUserId, permissionId: permission.id, effect: 'deny',
        scopeType: 'global', reason: 'Тимчасове обмеження на час перевірки',
        grantedBy: directorUserId,
      },
    })

    const scopes = await scopesOf(directorUserId)
    expect(scopes.some((s) => s.permission_code === 'audit.read')).toBe(false)
    expect(scopes.some((s) => s.permission_code === 'students.read')).toBe(true)
  })

  it('ignores an expired allow grant', async () => {
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code: 'audit.read' } })
    await prisma.permissionGrant.create({
      data: {
        userId: directorUserId, permissionId: permission.id, effect: 'allow',
        scopeType: 'global', reason: 'Доступ на час аудиту', grantedBy: directorUserId,
        expiresAt: new Date(Date.now() - 1000),
      },
    })

    expect(await scopesOf(directorUserId)).toHaveLength(0)
  })
})
```

- [ ] **Step 6: Застосувати міграцію й запустити всі тести**

Run: `pnpm --filter @starland/db exec prisma migrate dev`
Expected: міграція застосована, тригери створені, backfill відпрацював.

Run: `pnpm --filter @starland/db test`
Expected: PASS усі файли, зокрема `effective-scopes` (4 тести) і `teaching-scopes` (1 тест).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): add staff profiles and teaching assignments with scope refresh"
```

---

### Task 10: Аудит змін

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/sql/audit.sql`, `packages/db/test/audit.test.ts`

**Interfaces:**
- Consumes: Task 9
- Produces: `audit_logs`, тригерна функція `trg_write_audit_log()`, навішена на `permission_grants`, `user_roles`, `students`

- [ ] **Step 1: Написати падаючий тест**

`packages/db/test/audit.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { prisma } from '../src/index.js'
import { createAuthUser } from './rls-harness.js'

describe('audit log', () => {
  it('records who granted a permission and why', async () => {
    const authId = await createAuthUser(`grantor-${Date.now()}@starland.test`)
    const user = await prisma.appUser.findFirstOrThrow({ where: { authUserId: authId } })
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code: 'audit.read' } })

    const grant = await prisma.permissionGrant.create({
      data: {
        userId: user.id, permissionId: permission.id, effect: 'allow', scopeType: 'global',
        reason: 'Доступ на час річної перевірки', grantedBy: user.id,
      },
    })

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'permission_grants', entityId: grant.id },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.action).toBe('INSERT')
    expect(logs[0]?.newValues).toMatchObject({ reason: 'Доступ на час річної перевірки' })
  })

  it('records the old value when a student is edited', async () => {
    const student = await prisma.student.create({
      data: { firstName: 'Богдан', lastName: 'Хмельницький', bornOn: new Date('2014-01-01') },
    })
    await prisma.student.update({ where: { id: student.id }, data: { livingAddress: 'вул. Нова, 1' } })

    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'students', entityId: student.id, action: 'UPDATE' },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.oldValues).toMatchObject({ living_address: null })
  })
})
```

- [ ] **Step 2: Запустити й переконатися, що падає**

Run: `pnpm --filter @starland/db test audit`
Expected: FAIL — `prisma.auditLog` не існує.

- [ ] **Step 3: Додати модель**

```prisma
model AuditLog {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId     String?  @map("user_id") @db.Uuid
  entityType String   @map("entity_type")
  entityId   String   @map("entity_id") @db.Uuid
  action     String
  oldValues  Json?    @map("old_values")
  newValues  Json?    @map("new_values")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@index([entityType, entityId, createdAt])
  @@index([userId, createdAt])
  @@map("audit_logs")
}
```

- [ ] **Step 4: Написати універсальний тригер**

`packages/db/prisma/sql/audit.sql`:
```sql
create or replace function trg_write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
begin
  begin
    actor := current_app_user_id();
  exception when others then
    actor := null;
  end;

  insert into audit_logs (user_id, entity_type, entity_id, action, old_values, new_values)
  values (
    actor,
    tg_table_name,
    case tg_op when 'DELETE' then old.id else new.id end,
    tg_op,
    case tg_op when 'INSERT' then null else to_jsonb(old) end,
    case tg_op when 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end;
$$;

create trigger permission_grants_audit
  after insert or update or delete on permission_grants
  for each row execute function trg_write_audit_log();

create trigger user_roles_audit
  after insert or update or delete on user_roles
  for each row execute function trg_write_audit_log();

create trigger students_audit
  after insert or update or delete on students
  for each row execute function trg_write_audit_log();
```

**Чому `actor` може бути `null`:** сіди й міграції виконуються без сесії користувача. Це нормально й краще, ніж падіння тригера, — але для дій із застосунку `actor` завжди заповнений, бо там є `auth.uid()`.

- [ ] **Step 5: Міграція**

```bash
pnpm --filter @starland/db exec prisma migrate dev --create-only --name audit_logs
```

Дописати вміст `audit.sql` плюс:
```sql
alter table audit_logs enable row level security;

create policy audit_logs_read on audit_logs
  for select using (has_scope('audit.read', 'global'));
```

- [ ] **Step 6: Застосувати й запустити тести**

Run: `pnpm --filter @starland/db exec prisma migrate dev && pnpm --filter @starland/db test audit`
Expected: PASS, два тести.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): add audit log with generic change-capture trigger"
```

---

### Task 11: Налаштування школи

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/seed/settings.ts`, `packages/db/test/settings.test.ts`

**Interfaces:**
- Consumes: Task 10
- Produces: `app_settings(key, value, description)` з типізованим доступом `getSetting<T>(key)`

- [ ] **Step 1: Написати падаючий тест**

`packages/db/test/settings.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { getSetting } from '../src/settings.js'

describe('app settings', () => {
  it('returns the seeded no-show delay', async () => {
    expect(await getSetting('attendance.no_show_delay_minutes')).toBe(15)
  })

  it('returns the seeded retention period', async () => {
    expect(await getSetting('retention.graduate_years')).toBe(5)
  })

  it('throws for an unknown key instead of returning undefined', async () => {
    // @ts-expect-error перевіряємо поведінку в рантаймі на невідомому ключі
    await expect(getSetting('nope.not.a.key')).rejects.toThrow(/unknown setting/i)
  })
})
```

- [ ] **Step 2: Запустити й переконатися, що падає**

Run: `pnpm --filter @starland/db test settings`
Expected: FAIL — модуль `../src/settings.js` не знайдено.

- [ ] **Step 3: Додати модель і сід**

```prisma
model AppSetting {
  key         String   @id
  value       Json
  description String
  updatedBy   String?  @map("updated_by") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz

  @@map("app_settings")
}
```

`packages/db/prisma/seed/settings.ts`:
```ts
export const SETTINGS = {
  'attendance.no_show_delay_minutes': {
    value: 15,
    description: 'Скільки хвилин після початку першого уроку чекати перед сповіщенням «не прийшов»',
  },
  'attendance.state_reset_hour': {
    value: 3,
    description: 'Година щодобового скидання стану присутності',
  },
  'grades.edit_window_hours': {
    value: 48,
    description: 'Скільки годин вчитель може редагувати оцінку без окремого дозволу',
  },
  'retention.graduate_years': {
    value: 5,
    description: 'Скільки років зберігати дані випускника',
  },
  'moderation.reminder_hours': {
    value: 24,
    description: 'Через скільки годин нагадувати модератору про нерозглянутий коментар',
  },
} as const

export type SettingKey = keyof typeof SETTINGS
```

- [ ] **Step 4: Реалізувати типізований доступ**

`packages/db/src/settings.ts`:
```ts
import { prisma } from './client.js'
import { SETTINGS, type SettingKey } from '../prisma/seed/settings.js'

export async function getSetting<K extends SettingKey>(
  key: K,
): Promise<(typeof SETTINGS)[K]['value']> {
  if (!(key in SETTINGS)) {
    throw new Error(`Unknown setting: ${String(key)}`)
  }
  const row = await prisma.appSetting.findUnique({ where: { key } })
  return (row?.value ?? SETTINGS[key].value) as (typeof SETTINGS)[K]['value']
}
```

Якщо рядка в базі немає, повертається значення з сіду — застосунок не падає на свіжій базі.

Додати сід у `packages/db/prisma/seed/index.ts`:
```ts
import { SETTINGS } from './settings.js'

for (const [key, s] of Object.entries(SETTINGS)) {
  await prisma.appSetting.upsert({
    where: { key },
    update: { description: s.description },
    create: { key, value: s.value, description: s.description },
  })
}
```

- [ ] **Step 5: Міграція, сід, тести**

```bash
pnpm --filter @starland/db exec prisma migrate dev --create-only --name app_settings
```

Дописати:
```sql
alter table app_settings enable row level security;

create policy app_settings_read on app_settings for select using (auth.uid() is not null);
create policy app_settings_write on app_settings for update using (has_scope('settings.manage', 'global'));
```

Run: `pnpm --filter @starland/db exec prisma migrate dev && pnpm --filter @starland/db seed && pnpm --filter @starland/db test settings`
Expected: PASS, три тести.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): add app settings with typed accessor and seed defaults"
```

---

### Task 12: Доменний шар дозволів

**Files:**
- Create: `packages/domain/src/permissions.ts`, `packages/domain/src/errors.ts`, `packages/domain/test/permissions.test.ts`

**Interfaces:**
- Consumes: Task 5, Task 11
- Produces: `loadEffectivePermissions(userId): Promise<EffectivePermissions>`, `EffectivePermissions.can(code, scope?)`, `requirePermission(...)`, клас `ForbiddenError`

- [ ] **Step 1: Написати падаючий тест**

`packages/domain/test/permissions.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { EffectivePermissions, ForbiddenError, requirePermission } from '../src/permissions.js'

const scopes = [
  { permissionCode: 'students.read', scopeType: 'class' as const, scopeId: 'class-1' },
  { permissionCode: 'audit.read', scopeType: 'global' as const, scopeId: null },
]

describe('EffectivePermissions', () => {
  it('allows a global permission regardless of scope', () => {
    const p = new EffectivePermissions(scopes)
    expect(p.can('audit.read')).toBe(true)
    expect(p.can('audit.read', { type: 'class', id: 'class-9' })).toBe(true)
  })

  it('allows a scoped permission only inside its scope', () => {
    const p = new EffectivePermissions(scopes)
    expect(p.can('students.read', { type: 'class', id: 'class-1' })).toBe(true)
    expect(p.can('students.read', { type: 'class', id: 'class-2' })).toBe(false)
  })

  it('denies a permission that is not present at all', () => {
    const p = new EffectivePermissions(scopes)
    expect(p.can('students.write', { type: 'class', id: 'class-1' })).toBe(false)
  })

  it('throws ForbiddenError with the permission code in the message', () => {
    const p = new EffectivePermissions(scopes)
    expect(() => requirePermission(p, 'students.write', { type: 'class', id: 'class-1' }))
      .toThrow(ForbiddenError)
    expect(() => requirePermission(p, 'students.write', { type: 'class', id: 'class-1' }))
      .toThrow(/students\.write/)
  })
})
```

- [ ] **Step 2: Запустити й переконатися, що падає**

Run: `pnpm --filter @starland/domain test`
Expected: FAIL — модуль `../src/permissions.js` не знайдено.

- [ ] **Step 3: Реалізувати**

`packages/domain/src/errors.ts`:
```ts
export class ForbiddenError extends Error {
  constructor(public readonly permissionCode: string) {
    super(`Forbidden: missing permission ${permissionCode}`)
    this.name = 'ForbiddenError'
  }
}
```

`packages/domain/src/permissions.ts`:
```ts
import { ForbiddenError } from './errors.js'

export type ScopeType = 'global' | 'class' | 'subject' | 'student' | 'teaching_assignment' | 'user'

export interface EffectiveScope {
  permissionCode: string
  scopeType: ScopeType
  scopeId: string | null
}

export interface ScopeRef {
  type: Exclude<ScopeType, 'global'>
  id: string
}

export class EffectivePermissions {
  private readonly index = new Map<string, Set<string>>()
  private readonly globals = new Set<string>()

  constructor(scopes: readonly EffectiveScope[]) {
    for (const s of scopes) {
      if (s.scopeType === 'global') {
        this.globals.add(s.permissionCode)
        continue
      }
      const key = `${s.permissionCode}:${s.scopeType}`
      const set = this.index.get(key) ?? new Set<string>()
      if (s.scopeId !== null) set.add(s.scopeId)
      this.index.set(key, set)
    }
  }

  can(permissionCode: string, scope?: ScopeRef): boolean {
    if (this.globals.has(permissionCode)) return true
    if (!scope) return false
    return this.index.get(`${permissionCode}:${scope.type}`)?.has(scope.id) ?? false
  }

  /** Усі id у межах конкретного типу скоупу — для побудови фільтрів у запитах. */
  scopeIds(permissionCode: string, scopeType: ScopeRef['type']): readonly string[] {
    return [...(this.index.get(`${permissionCode}:${scopeType}`) ?? [])]
  }
}

export function requirePermission(
  permissions: EffectivePermissions,
  permissionCode: string,
  scope?: ScopeRef,
): void {
  if (!permissions.can(permissionCode, scope)) {
    throw new ForbiddenError(permissionCode)
  }
}

export { ForbiddenError }
```

- [ ] **Step 4: Додати завантаження з бази**

`packages/domain/src/permissions-loader.ts`:
```ts
import { prisma } from '@starland/db'
import { EffectivePermissions, type EffectiveScope, type ScopeType } from './permissions.js'

export async function loadEffectivePermissions(userId: string): Promise<EffectivePermissions> {
  const rows = await prisma.userEffectiveScope.findMany({
    where: { userId },
    select: { permissionCode: true, scopeType: true, scopeId: true },
  })
  const scopes: EffectiveScope[] = rows.map((r) => ({
    permissionCode: r.permissionCode,
    scopeType: r.scopeType as ScopeType,
    scopeId: r.scopeId,
  }))
  return new EffectivePermissions(scopes)
}
```

`packages/domain/src/index.ts` — публічна поверхня пакета, саме з неї імпортує адмінка:
```ts
export {
  EffectivePermissions,
  requirePermission,
  type EffectiveScope,
  type ScopeRef,
  type ScopeType,
} from './permissions.js'
export { ForbiddenError } from './errors.js'
export { loadEffectivePermissions } from './permissions-loader.js'
```

Додати `@starland/db` у залежності `packages/domain/package.json` як `"workspace:*"`.

- [ ] **Step 5: Запустити тести**

Run: `pnpm --filter @starland/domain test`
Expected: PASS, чотири тести.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(domain): add effective permissions evaluation and guards"
```

---

### Task 13: Застосунок адмінки і вхід

**Files:**
- Create: `apps/admin/` (Next.js), `apps/admin/src/lib/session.ts`, `apps/admin/src/app/login/page.tsx`, `apps/admin/src/app/layout.tsx`, `apps/admin/middleware.ts`
- Create: `packages/i18n/src/uk.ts`

**Interfaces:**
- Consumes: Task 12
- Produces: `getSession()` → `{ appUserId, permissions }`, редирект неавтентифікованих на `/login`

- [ ] **Step 1: Створити застосунок**

```bash
pnpm create next-app@latest apps/admin --typescript --app --eslint --tailwind --src-dir --import-alias "@/*" --no-turbopack
pnpm --filter @starland/admin add @supabase/supabase-js @supabase/ssr zod
pnpm --filter @starland/admin add @starland/db@workspace:* @starland/domain@workspace:* @starland/i18n@workspace:*
```

- [ ] **Step 2: Додати словник**

`packages/i18n/src/uk.ts`:
```ts
export const uk = {
  common: {
    save: 'Зберегти',
    cancel: 'Скасувати',
    edit: 'Редагувати',
    search: 'Пошук',
    empty: 'Нічого не знайдено',
    loading: 'Завантаження…',
    forbidden: 'Немає доступу',
  },
  auth: {
    signIn: 'Увійти',
    email: 'Електронна пошта',
    password: 'Пароль',
    invalidCredentials: 'Невірна пошта або пароль',
  },
  students: {
    title: 'Учні',
    fullName: 'ПІБ',
    class: 'Клас',
    bornOn: 'Дата народження',
    address: 'Адреса проживання',
    criticalNote: 'Критично важливе',
    guardians: 'Батьки та опікуни',
    measurements: 'Вимірювання',
  },
} as const
```

`packages/i18n/src/index.ts`:
```ts
import { uk } from './uk.js'

export { uk }
export const t = uk
```

- [ ] **Step 3: Написати сесійний шар**

`apps/admin/src/lib/session.ts`:
```ts
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { prisma } from '@starland/db'
import { loadEffectivePermissions } from '@starland/domain'
import type { EffectivePermissions } from '@starland/domain'

export interface Session {
  appUserId: string
  fullName: string
  permissions: EffectivePermissions
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => list.forEach((c) => cookieStore.set(c.name, c.value, c.options)),
      },
    },
  )

  const { data } = await supabase.auth.getUser()
  if (!data.user) return null

  const appUser = await prisma.appUser.findFirst({
    where: { authUserId: data.user.id, deletedAt: null, isActive: true },
  })
  if (!appUser) return null

  return {
    appUserId: appUser.id,
    fullName: appUser.fullName,
    permissions: await loadEffectivePermissions(appUser.id),
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) throw new Error('unauthenticated')
  return session
}
```

- [ ] **Step 4: Додати middleware редиректу**

`apps/admin/middleware.ts`:
```ts
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => list.forEach((c) => response.cookies.set(c.name, c.value, c.options)),
      },
    },
  )

  const { data } = await supabase.auth.getUser()
  if (!data.user && !request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 5: Сторінка входу**

`apps/admin/src/app/login/page.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { uk } from '@starland/i18n'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(uk.auth.invalidCredentials)
      return
    }
    window.location.href = '/'
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-24 flex w-80 flex-col gap-3">
      <h1 className="text-xl font-semibold">Starland</h1>
      <input className="rounded border px-3 py-2" type="email" placeholder={uk.auth.email}
             value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="rounded border px-3 py-2" type="password" placeholder={uk.auth.password}
             value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="rounded bg-black px-3 py-2 text-white" type="submit">{uk.auth.signIn}</button>
    </form>
  )
}
```

- [ ] **Step 6: Перевірити вручну**

Run: `pnpm --filter @starland/admin dev`
Створити тестового користувача в Supabase Studio (`http://127.0.0.1:54323`), додати рядок у `app_users` і роль `director`, увійти.
Expected: після входу редиректить на `/`, без входу — на `/login`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(admin): add next.js app with supabase auth and session layer"
```

---

### Task 14: Список учнів і профіль

**Files:**
- Create: `apps/admin/src/app/students/page.tsx`, `apps/admin/src/app/students/[id]/page.tsx`, `apps/admin/src/components/person-link.tsx`
- Create: `apps/admin/src/lib/students/update-student.ts` (чиста логіка), `apps/admin/src/app/students/actions.ts` (тонка обгортка)
- Create: `apps/admin/test/students-page.test.ts`

**Interfaces:**
- Consumes: Task 13
- Produces: `<PersonLink id name kind />`, Server Action `updateStudent(input)`

- [ ] **Step 1: Написати падаючий тест на Server Action**

`apps/admin/test/students-page.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { ForbiddenError, EffectivePermissions } from '@starland/domain'
import { updateStudentWithPermissions } from '../src/lib/students/update-student.js'

const student = { id: 'student-1', classId: 'class-1' }

describe('updateStudent', () => {
  it('refuses when the user has no write permission for that class', async () => {
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.read', scopeType: 'class', scopeId: 'class-1' },
    ])
    await expect(
      updateStudentWithPermissions(permissions, student, { livingAddress: 'вул. Нова, 1' }),
    ).rejects.toThrow(ForbiddenError)
  })

  it('rejects an empty address instead of writing it', async () => {
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.write', scopeType: 'class', scopeId: 'class-1' },
    ])
    await expect(
      updateStudentWithPermissions(permissions, student, { livingAddress: '   ' }),
    ).rejects.toThrow(/livingAddress/)
  })
})
```

- [ ] **Step 2: Запустити й переконатися, що падає**

Run: `pnpm --filter @starland/admin test`
Expected: FAIL — модуль `actions.js` не знайдено.

- [ ] **Step 3: Реалізувати Server Action**

`apps/admin/src/lib/students/update-student.ts` — **без** директиви `'use server'`:
```ts
import { z } from 'zod'
import { prisma } from '@starland/db'
import { requirePermission, type EffectivePermissions } from '@starland/domain'

const UpdateStudentInput = z.object({
  livingAddress: z.string().trim().min(1, 'livingAddress must not be empty').optional(),
  criticalNote: z.string().trim().max(500).optional(),
})

export type UpdateStudentInput = z.infer<typeof UpdateStudentInput>

/** Чиста логіка без Next.js — саме її покривають тести. */
export async function updateStudentWithPermissions(
  permissions: EffectivePermissions,
  student: { id: string; classId: string },
  raw: unknown,
): Promise<void> {
  requirePermission(permissions, 'students.write', { type: 'class', id: student.classId })
  const input = UpdateStudentInput.parse(raw)
  await prisma.student.update({ where: { id: student.id }, data: input })
}
```

`apps/admin/src/app/students/actions.ts` — тонка обгортка:
```ts
'use server'

import { prisma } from '@starland/db'
import { requireSession } from '@/lib/session'
import { updateStudentWithPermissions } from '@/lib/students/update-student'

export async function updateStudent(studentId: string, raw: unknown): Promise<void> {
  const session = await requireSession()
  const enrollment = await prisma.enrollment.findFirstOrThrow({
    where: { studentId, toDate: null },
    select: { classId: true },
  })
  await updateStudentWithPermissions(
    session.permissions,
    { id: studentId, classId: enrollment.classId },
    raw,
  )
}
```

**Чому два файли, а не один.** Кожен експорт із модуля з `'use server'` стає
серверною дією, а її аргументи мають бути серіалізовними — передати туди
`EffectivePermissions` (клас) неможливо. Плюс це збігається з правилом із
`CLAUDE.md`: у Server Action лишається тільки отримання сесії, виклик домену й
маппінг результату.

Валідація Zod живе всередині чистої функції, тому порожня адреса не доходить до
бази ні з форми, ні з тесту.

- [ ] **Step 4: Клікабельне посилання на профіль**

`apps/admin/src/components/person-link.tsx`:
```tsx
import Link from 'next/link'

export function PersonLink({ id, name, kind }: { id: string; name: string; kind: 'student' | 'staff' }) {
  return (
    <Link className="underline underline-offset-2" href={`/${kind === 'student' ? 'students' : 'staff'}/${id}`}>
      {name}
    </Link>
  )
}
```

Правило зі спеки: будь-яка згадка людини клікабельна. Один компонент означає, що це правило неможливо забути в новому екрані — інших способів вивести імʼя просто немає.

- [ ] **Step 5: Сторінка списку**

`apps/admin/src/app/students/page.tsx`:
```tsx
import { prisma } from '@starland/db'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'
import { PersonLink } from '@/components/person-link'

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  await requireSession()
  const { q } = await searchParams

  // RLS сам відсіче чужих учнів — додаткового фільтра за правами тут не треба.
  const students = await prisma.student.findMany({
    where: q
      ? { OR: [{ lastName: { contains: q, mode: 'insensitive' } },
               { firstName: { contains: q, mode: 'insensitive' } }] }
      : undefined,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 100,
    include: { enrollments: { where: { toDate: null }, include: { class: true }, take: 1 } },
  })

  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">{uk.students.title}</h1>
      <form className="mb-4"><input name="q" defaultValue={q} placeholder={uk.common.search}
             className="rounded border px-3 py-2" /></form>
      {students.length === 0 ? (
        <p className="text-neutral-500">{uk.common.empty}</p>
      ) : (
        <table className="w-full text-left">
          <thead><tr><th>{uk.students.fullName}</th><th>{uk.students.class}</th></tr></thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="py-2">
                  <PersonLink id={s.id} kind="student" name={`${s.lastName} ${s.firstName}`} />
                </td>
                <td>{s.enrollments[0]?.class.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
```

- [ ] **Step 6: Сторінка профілю з двома режимами**

`apps/admin/src/app/students/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { prisma } from '@starland/db'
import { uk } from '@starland/i18n'
import { requireSession } from '@/lib/session'

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession()

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      enrollments: { where: { toDate: null }, include: { class: true }, take: 1 },
      guardianships: { include: { person: true } },
      measurements: { orderBy: { measuredOn: 'desc' }, take: 10 },
    },
  })
  if (!student) notFound()

  const classId = student.enrollments[0]?.classId
  const canEdit = classId
    ? session.permissions.can('students.write', { type: 'class', id: classId })
    : false

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">{student.lastName} {student.firstName}</h1>
      {student.criticalNote && (
        <p className="my-3 rounded bg-red-50 p-3 text-red-800">
          <strong>{uk.students.criticalNote}:</strong> {student.criticalNote}
        </p>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-2">
        <dt>{uk.students.class}</dt><dd>{student.enrollments[0]?.class.name ?? '—'}</dd>
        <dt>{uk.students.bornOn}</dt><dd>{student.bornOn.toLocaleDateString('uk-UA')}</dd>
        <dt>{uk.students.address}</dt><dd>{student.livingAddress ?? '—'}</dd>
      </dl>

      <h2 className="mt-6 font-semibold">{uk.students.guardians}</h2>
      <ul>
        {student.guardianships.map((g) => (
          <li key={g.id}>{g.person.lastName} {g.person.firstName} — {g.relation} {g.person.phone ?? ''}</li>
        ))}
      </ul>

      {canEdit && <a className="mt-6 inline-block underline" href={`/students/${id}/edit`}>{uk.common.edit}</a>}
    </main>
  )
}
```

Кнопка редагування не рендериться взагалі, якщо дозволу немає — правило зі спеки, а не «сховати через CSS».

- [ ] **Step 7: Запустити тести й перевірити вручну**

Run: `pnpm --filter @starland/admin test && pnpm --filter @starland/admin dev`
Expected: тести PASS; список показує лише тих учнів, яких дозволяє RLS для поточної ролі.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(admin): add students list and profile with permission-aware editing"
```

---

### Task 15: Перф-бюджет RLS

**Files:**
- Create: `packages/db/test/fixtures/large-dataset.ts`, `packages/db/test/rls-performance.test.ts`

**Interfaces:**
- Consumes: Task 9
- Produces: `seedLargeDataset()` — 350 учнів, 14 класів, 20 вчителів, 2 роки

- [ ] **Step 1: Написати падаючий тест**

`packages/db/test/rls-performance.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { asUser } from './rls-harness.js'
import { seedLargeDataset } from './fixtures/large-dataset.js'

describe('rls performance', () => {
  let teacherAuthId: string

  beforeAll(async () => {
    ({ teacherAuthId } = await seedLargeDataset())
  }, 120_000)

  it('lists visible students in under 200ms', async () => {
    const ms = await asUser(teacherAuthId, async (c) => {
      const started = performance.now()
      await c.query('select id, first_name, last_name from students order by last_name limit 100')
      return performance.now() - started
    })

    expect(ms).toBeLessThan(200)
  })

  it('does not re-evaluate the scope subquery per row', async () => {
    const plan = await asUser(teacherAuthId, async (c) => {
      const r = await c.query<{ 'QUERY PLAN': string }>(
        'explain (analyze, format text) select id from students',
      )
      return r.rows.map((row) => row['QUERY PLAN']).join('\n')
    })

    // Підзапит по user_effective_scopes має стати hashed SubPlan / InitPlan,
    // а не виконуватись для кожного рядка students.
    expect(plan).toMatch(/SubPlan|InitPlan|Hash/i)
    expect(plan).not.toMatch(/rows=\d+ loops=[1-9]\d{2,}/)
  })
})
```

- [ ] **Step 2: Запустити й переконатися, що падає**

Run: `pnpm --filter @starland/db test rls-performance`
Expected: FAIL — модуль фікстури не знайдено.

- [ ] **Step 3: Написати фікстуру**

`packages/db/test/fixtures/large-dataset.ts`:
```ts
import { prisma } from '../../src/index.js'
import { createAuthUser } from '../rls-harness.js'

export async function seedLargeDataset(): Promise<{ teacherAuthId: string }> {
  const year = await prisma.academicYear.create({
    data: { name: `Perf-${Date.now()}`, startsOn: new Date('2026-09-01'), endsOn: new Date('2027-06-30') },
  })
  const period = await prisma.academicPeriod.create({
    data: { academicYearId: year.id, name: 'I семестр', ordinal: 1,
            startsOn: new Date('2026-09-01'), endsOn: new Date('2026-12-28') },
  })
  const subject = await prisma.subject.create({
    data: { code: `perf-math-${Date.now()}`, name: 'Математика' },
  })

  const classes = await Promise.all(
    Array.from({ length: 14 }, (_, i) =>
      prisma.class.create({
        data: { academicYearId: year.id, gradeLevel: (i % 9) + 1, name: `P${i}-А` },
      }),
    ),
  )

  await prisma.student.createMany({
    data: Array.from({ length: 350 }, (_, i) => ({
      firstName: `Учень${i}`,
      lastName: `Прізвище${i % 60}`,
      bornOn: new Date('2014-01-01'),
    })),
  })
  const students = await prisma.student.findMany({
    where: { firstName: { startsWith: 'Учень' } },
    select: { id: true },
  })

  await prisma.enrollment.createMany({
    data: students.map((s, i) => ({
      studentId: s.id,
      classId: classes[i % classes.length]!.id,
      fromDate: new Date('2026-09-01'),
    })),
  })

  const teacherAuthId = await createAuthUser(`perf-teacher-${Date.now()}@starland.test`)
  const teacher = await prisma.appUser.findFirstOrThrow({ where: { authUserId: teacherAuthId } })
  const role = await prisma.role.findUniqueOrThrow({ where: { code: 'teacher' } })

  await prisma.teachingAssignment.create({
    data: { teacherUserId: teacher.id, subjectId: subject.id, classId: classes[0]!.id, periodId: period.id },
  })
  await prisma.userRole.create({ data: { userId: teacher.id, roleId: role.id } })

  return { teacherAuthId }
}
```

- [ ] **Step 4: Запустити тест**

Run: `pnpm --filter @starland/db test rls-performance`
Expected: PASS. Якщо падає — політика написана з викликом функції по рядках; переписати на `IN (SELECT ...)` за зразком Task 7.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(db): add rls performance budget on a realistic dataset"
```

---

### Task 16: Межі пакетів і CI

**Files:**
- Modify: `eslint.config.js`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: усі попередні задачі
- Produces: правило заборони імпорту кухні в адмінку; CI, що ганяє typecheck, lint і тести

- [ ] **Step 1: Написати падаючу перевірку**

Створити тимчасовий файл `apps/admin/src/forbidden-import-check.ts`:
```ts
// Цей файл існує лише для перевірки правила меж і видаляється в Step 4.
import '@starland/integrations-kitchen'
```

- [ ] **Step 2: Переконатися, що лінт поки що це пропускає**

Run: `pnpm lint`
Expected: PASS — тобто правила ще немає, і заборонений імпорт проходить.

- [ ] **Step 3: Додати правило**

`eslint.config.js`:
```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/admin/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['@starland/integrations-kitchen', '**/integrations/kitchen/**'],
          message:
            'Кухонна інтеграція заборонена в apps/admin. Її код живе тільки в portal і api — ' +
            'див. розділ 8 docs/specs/2026-07-31-starland-design.md.',
        }],
      }],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
)
```

- [ ] **Step 4: Перевірити, що правило спрацювало, і прибрати файл**

Run: `pnpm lint`
Expected: FAIL з повідомленням про заборонену кухонну інтеграцію.

```bash
rm apps/admin/src/forbidden-import-check.ts
pnpm lint
```
Expected: PASS.

- [ ] **Step 5: Додати CI**

`.github/workflows/ci.yml`:
```yaml
name: CI
on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase start
      - run: psql "$DATABASE_URL" -c "alter database postgres set app.health_key = 'ci-key'"
        env:
          DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      - run: pnpm --filter @starland/db exec prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      - run: pnpm --filter @starland/db seed
        env:
          DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
        env:
          DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

- [ ] **Step 6: Запустити повну перевірку локально**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS усі три команди. Вивід зберегти — саме він є доказом готовності Т1.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: enforce package boundaries and add ci pipeline"
```

---

## Що лишається поза Т1

Т2 «Журнал» — розклад із апрувом, уроки, шкали оцінок, оцінки, модерація, ДЗ.
Т3 «Присутність і комунікація» — приймання сканів, авто-Н, портал родин, чати, outbox, Telegram, email.
Т4 «Аналітика й інтеграції» — звіти, рівень навченості, трекер часу, кухня, ICS, експорт.

Кожен отримує власний план за цим же форматом.
