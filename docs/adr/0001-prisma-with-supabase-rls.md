# ADR 0001: Prisma Migrate поверх Supabase RLS — версія, shadow database, analytics

**Статус:** Прийнято (Task 2, 2026-07-31)

## Контекст

Стек (розділ 1 `CLAUDE.md`) фіксує Prisma як ORM і Supabase Postgres з RLS.
Перша ж міграція (`app_users` + `app_users_self_select`, Task 2) наштовхнулась
на дві незалежні проблеми інструментарію, які впливають на кожну наступну
міграцію з RLS-політикою, а не лише на цю одну:

1. На момент виконання задачі `pnpm add prisma` резолвить `7.9.1` — мажорна
   версія прибрала `datasource { url = env(...) }` у `schema.prisma` на
   користь окремого `prisma.config.ts` (`P1012`). Це той самий клас
   несумісності, що й з `typescript` у Task 1: інструментарій пішов далі за
   те, що очікує план.
2. `prisma migrate dev` перед застосуванням реплеює всю історію міграцій у
   тимчасовій shadow database, щоб виявити дрейф. Наша RLS-політика
   викликає `auth.uid()` — функцію, яку визначає Supabase/GoTrue лише у
   реальній базі проєкту. У щойно створеній shadow database схеми `auth`
   немає взагалі, тож `migrate dev` падає з `P3006: schema "auth" does not
   exist`. Це відома взаємодія Prisma + Supabase (Prisma issues #17313,
   #18881, #26231, обговорення #17035; офіційний Supabase Prisma
   troubleshooting guide прямо попереджує не звертатись до керованих
   Supabase схем із міграцій Prisma, але RLS-політики на `auth.uid()` —
   вимога самого проєкту, розділ 3 `CLAUDE.md`).

Додатково: `supabase start` стабільно падав на health-check контейнерів
`logflare`/`vector` (сервіс аналітики), відтворено двічі поспіль навіть
після повного локального кешу образів.

## Рішення

1. **Пінимо `prisma` і `@prisma/client` на `^6.19.3`** (останній мажор 6.x) —
   `datasource.url` у `schema.prisma` й далі підтримується, схема плану
   лишається дослівною.
2. **Shadow database — окрема, persist-нута, з підготовленим стабом
   `auth.uid()`.** `packages/db/prisma/schema.prisma` отримав
   `shadowDatabaseUrl = env("SHADOW_DATABASE_URL")` (додатково до
   `url`, не замість). Стаб живе в `packages/db/prisma/bootstrap/shadow-bootstrap.sql`
   (не в `prisma/sql/` — той каталог зарезервований під Prisma TypedSQL,
   один запит на файл, а це DDL; майбутні задачі плану вже claim'ять
   `prisma/sql/*.sql` під TypedSQL-запити) (ідемпотентний: `create schema if not exists auth` +
   `create or replace function auth.uid() returns uuid ... select null::uuid`)
   і застосовується командою `pnpm --filter @starland/db run shadow:bootstrap`
   (`packages/db/scripts/bootstrap-shadow-db.mjs`): створює базу
   `prisma_shadow` на тому ж Postgres-сервері, якщо її ще немає, і накатує
   SQL-файл через `prisma db execute`. Реального `auth.uid()` (визначення
   GoTrue в базі `postgres`) цей стаб не чіпає — окрема база, окреме
   з'єднання.
3. **`[analytics] enabled = false`** у `supabase/config.toml` — аналітика
   не потрібна жодному завданню в межах Т1, а її контейнери — джерело
   нестабільного локального старту.

## Наслідки

- Кожен новий чекаут або скинутий Docker-том Supabase вимагає одноразово
  `pnpm --filter @starland/db run shadow:bootstrap` перед першим
  `prisma migrate dev`. Скрипт ідемпотентний — безпечно ганяти повторно.
- Будь-яка майбутня RLS-політика, що звертається до `auth.*` (наприклад,
  `auth.jwt()`), потребує розширення `shadow-bootstrap.sql` відповідним
  стабом — інакше та ж `P3006` повториться для нової міграції.
- Версію Prisma 6.x тримаємо свідомо; апгрейд на 7.x — окреме рішення (нове
  ADR), бо вимагає міграції на `prisma.config.ts` і, ймовірно, перегляду
  цього ADR.
- Якщо колись керування RLS-міграціями перенесеться з Prisma Migrate на
  власний інструментарій Supabase CLI (`supabase migration new` /
  `supabase db push`) — весь цей ADR стає нерелевантним: у Supabase CLI
  немає окремої shadow database з такою проблемою, вона працює проти копії
  реальної схеми проєкту. Такий перехід — привід переглянути й, скоріш за
  все, закрити цей ADR, а не доповнювати.
