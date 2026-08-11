# ADR 0003: `health_key()` читає ключ із Supabase Vault, не з GUC бази

**Статус:** Прийнято (Task 13, 2026-08-07)

## Контекст

Task 8 (T1) увів `health_key()` — джерело symmetric-ключа для
`pgp_sym_encrypt`/`pgp_sym_decrypt` у `read_health_note`/`write_health_note`.
Оригінальний коментар у міграції `20260801130000_health_data`:

> Ключ читається з налаштування бази, а не зберігається в ній.
> Локально задається через: `alter database postgres set app.health_key = '...'`.
> На проді значення приходить із Supabase Vault.

Тобто задум був: **локально** (в тому числі на shared dev-проєкті) —
database-level GUC через `ALTER DATABASE`, **на проді** — Vault. CI це
підтверджує (`.github/workflows/ci.yml`): проти локального Supabase CLI
(Docker Postgres, де `postgres` — справжній суперкористувач) `ALTER DATABASE
postgres set app.health_key = 'ci-key'` спрацьовує без проблем.

Розробка Task 13 велась проти **хостованого** Supabase-проєкту (той самий,
проти якого йдуть усі тести цього репозиторію — `packages/db/.env`), не
локального CLI. Спроба виконати той самий `ALTER DATABASE ... SET
app.health_key = '...'` — і навіть вужчий варіант, `ALTER ROLE app_runtime
SET app.health_key = '...'` — провалилась з `42501: permission denied to set
parameter "app.health_key"` **в обох випадках**, включно з виконанням від
імені власника проєкту через Supabase SQL Editor. Це не питання прав
конкретної ролі: хостований Supabase блокує `ALTER DATABASE/ROLE ... SET`
для довільних кастомних GUC на рівні платформи для будь-кого, крім їхнього
внутрішнього суперкористувача — на відміну від локального `supabase start`,
де `postgres` є справжнім суперкористувачем.

Отже "локально: GUC" з оригінального задуму нежиттєздатне для
хостованого dev-проєкту, яким цей репозиторій фактично користується.

## Рішення

**`health_key()` завжди читає ключ із Supabase Vault** (`vault.create_secret`
/ `vault.decrypted_secrets`), без гілки "локально інакше, ніж на проді" —
той самий шлях скрізь, де є розширення `supabase_vault` (є і на хостованому
проєкті, і на `supabase start` за замовчуванням).

```sql
create or replace function health_key() returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  result text;
begin
  select decrypted_secret into result from vault.decrypted_secrets where name = 'app_health_key';
  if result is null then
    raise exception 'app_health_key secret not found in vault';
  end if;
  return result;
end;
$$;
```

- `security definer` + явний `search_path`: `vault.decrypted_secrets`
  читають лише `postgres`/`service_role` (перевірено через
  `information_schema.role_table_grants`), а `health_key()` викликається
  зсередини `read_health_note`/`write_health_note`, які й самі `security
  definer` з тим самим власником (`postgres`) — той самий, уже усталений у
  цьому файлі патерн, не новий прецедент.
- Явний `raise exception`, якщо секрет відсутній, — та сама поведінка "гучно
  падає, якщо не налаштовано", що мав `current_setting(..., false)`
  (`false` = не `missing_ok`). Мовчазний `NULL`-ключ (типова поведінка SQL-
  функції над запитом із нуля рядків) означав би тихе шифрування/дешифрування
  сміттям — гірше, ніж явна помилка.
- Значення заводиться командою `select vault.create_secret('<ключ>',
  'app_health_key', '<опис>');` — виконується один раз на базу (CI: проти
  щойно піднятого локального Supabase; dev/staging: вручну проти реального
  проєкту), не в коді застосунку і не в конфігу.
- `.github/workflows/ci.yml` оновлено: замість `psql ... alter database
  postgres set app.health_key = 'ci-key'` — `vault.create_secret('ci-key',
  'app_health_key', 'CI key')` через `psql` з тим самим `DATABASE_URL`.

## Наслідки

- Немає більше гілки "по-різному локально й на проді" для цього ключа —
  один механізм, один шлях коду.
- Кожна **нова** база (новий Supabase-проєкт, скинутий `supabase start`)
  вимагає одноразового `select vault.create_secret(...)` перед першим
  використанням `read_health_note`/`write_health_note`, інакше обидві
  функції падають з `app_health_key secret not found in vault` — це
  навмисно (fail-loud), не typo.
- Це не стосується `SHADOW_DATABASE_URL` (Task 2 / ADR 0001): shadow-база
  ніколи не виконує `read_health_note`/`write_health_note`, лише реплеює DDL
  міграцій під час `prisma migrate dev`.
