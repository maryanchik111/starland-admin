# Starland — дизайн-система на shadcn/ui, управління користувачами, повний CRUD учнів

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.
> Один крок = один коміт, Conventional Commits, англійською. TDD обов'язковий для
> RLS-політик і доменної логіки запису. Кожен таск: implementer-агент → reviewer-агент
> → фікс-раунди → запис у ledger (`.superpowers/sdd/2026-08-07-.../progress.md`).

**Goal:** Перевести весь `apps/admin` на shadcn/ui (Ціль 1); дати директору повний
контроль над користувачами й ролями (Ціль 2); дати повний CRUD над учнями — базові
поля, зарахування/клас, опікуни, медичні дані (Ціль 3). Архітектура доступу
(`withUserContext`, `EffectivePermissions.can`, RLS-first) не змінюється.

**Reference:** `reference-admin/` — локальний чекаут `satnaing/shadcn-admin`
(джерело копіювання компонентів, не залежність, гітигнорений). Дашборд референсу
показує вигадані SaaS-метрики (Revenue/Sales) — це НЕ копіюється буквально, лише
візуальна система (картки, таблиці, тулбари, sidebar).

## Global constraints (з CLAUDE.md, повторено для агентів)

- RLS на кожній таблиці; політика — `IN (SELECT ...)`/`EXISTS`/`has_scope(...)`,
  ніколи функція з рядково-залежним аргументом.
- Фізичних видалень немає — `deleted_at`/`revoked_at`.
- `any` заборонено. Zod на кожній межі Server Action.
- UI-тексти — тільки через `packages/i18n`'s `uk`.
- Кожен екран — `view`/`edit` за дозволом; немає дозволу → елемент не рендериться.
- `SUPABASE_SERVICE_ROLE_KEY` — тільки server-only модуль в `apps/admin`.
- На `app_users`, `roles`, `permissions`, `role_permissions`, `user_roles`,
  `permission_grants`, `enrollments`, `guardian_persons`, `guardianships` немає
  жодної INSERT/UPDATE/DELETE RLS-політики (перевірено в схемі) — усі записи йдуть
  через `requirePermission` + привілейований `prisma` + `set_config('request.jwt.claims', ...)`
  **без** `set local role authenticated`, точно як
  [`apps/admin/src/lib/students/update-student.ts`](../../apps/admin/src/lib/students/update-student.ts).
  Цей паттерн — шаблон для КОЖНОЇ нової функції запису в цьому плані.
- Медичні дані (`student_health_notes`) НЕ пишуться напряму — тільки через уже
  існуючі `SECURITY DEFINER` функції `read_health_note(student_id)` /
  `write_health_note(student_id, content)` (створені в T1 Task 8), які самі
  перевіряють `has_scope('health_notes.read'|'health.write', 'global')` і шифрують
  через `pgp_sym_encrypt`. Новий код лише викликає їх, не обходить.
- Оркестраційні функції запису (create/update/assign/revoke) живуть у
  `apps/admin/src/lib/<feature>/*.ts`, не в `packages/domain` — той самий
  прецедент і те саме обґрунтування, що вже прийняте для `update-student.ts`
  (`packages/domain` потенційно імпортується й `apps/portal`, там не може бути
  навіть натяку на серверні секрети чи адмінські операції).

---

## GOAL 1 — Дизайн-система

### Task 1: Примітиви й залежності (без зміни поведінки)

Встановити відсутні shadcn-примітиви (`card`, `select`, `checkbox`, `tabs`, `form`,
`label`, `textarea`, `alert`, `alert-dialog`, `popover`, `sonner`) —
портувати з `reference-admin/src/components/ui/*`, підправивши лише імпорти.
Додати залежності: `@tanstack/react-table`, `react-hook-form`, `@hookform/resolvers`,
відповідні `@radix-ui/*` пакети, `sonner`. Звести спільний DataTable-каркас
(`apps/admin/src/components/data-table/{column-header,toolbar,pagination}.tsx`) —
на відміну від референсу (React Router), пагінація/пошук/фільтри йдуть через
Next.js `searchParams` на сервері, `@tanstack/react-table` — лише для рендеру
колонок і клієнтського сортування вже завантаженої сторінки. Додати `<Toaster />`
в корневий layout. Перевірка: typecheck+lint зелені, жодна сторінка ще не змінилась.

### Task 2: Students list → Table/Card/Toolbar/Pagination (шаблон для решти)

Переписати `students/page.tsx`: серверна пагінація (`skip/take` + окремий
`count()`), `columns.tsx` (ColumnDef, клас — `Badge`, dropdown дій), клієнтський
`students-table.tsx` (Table + DataTableToolbar з пошуком + DataTablePagination),
`Card`-обгортка, порожній стан як рядок таблиці, `Skeleton` під час завантаження.

### Task 3: Students detail + edit → Card/Form

`[id]/page.tsx` — `Card`-секції замість `<dl>/<ul>`, критична нотатка —
`Alert variant="destructive"`. `[id]/edit/page.tsx` — `react-hook-form` +
`zodResolver`, shadcn `Form`/`FormField`/`Label`/`Textarea`; Server Action-контракт
(`updateStudent(id, raw)`) не змінюється, лише UX (помилки через `form.setError`
замість `redirect(?error=)`).

### Task 4: Login + dashboard shell → shadcn

`/login` — `Card` по центру, `Label`+`Input`, помилка — `Alert`. Логіка входу не
змінюється. `/` (дашборд) — `Card`-плейсхолдер зі шкільним змістом (привітання,
можливо кількість учнів/класів одним запитом), НЕ фейкові SaaS-метрики референсу.

---

## GOAL 2 — Управління користувачами

### Task 5: Users list (director-only) + нова SELECT-політика

`app_users`/`user_roles` мають лише self-scoped SELECT. Директор із `users.read`
(global) не бачить чужі рядки без нової політики — падаючий RLS-тест спочатку
(`packages/db/test/users-read-policy.test.ts`, positive/negative), потім міграція:
```sql
create policy app_users_read_all on app_users for select using (has_scope('users.read','global'));
create policy user_roles_read_all on user_roles for select using (has_scope('users.read','global'));
```
Сторінка списку — той самий шаблон, що Task 2. Пункт меню «Користувачі»
(`nav-config.ts`, `permissionCode: 'users.read'`).

### Task 6: Створення користувача (Supabase Admin API, тимчасовий пароль)

Директор задає повне ім'я + email + роль + тимчасовий пароль (без email-запрошення
— підтверджено рішенням, немає SMTP). `apps/admin/src/lib/users/supabase-admin-client.ts`
(`import 'server-only'`, читає `SUPABASE_SERVICE_ROLE_KEY`) → Admin API
`auth.admin.createUser({email, password, email_confirm:true})` → якщо роль
невідома, провалити ДО виклику Admin API (уникнути сирітського auth-рядка) →
`prisma.$transaction` з `set_config` → `app_users` + `user_roles`. Якщо
Prisma-крок впаде після успішного створення auth-користувача — компенсаційний
`auth.admin.deleteUser` (best-effort, залогувати якщо і це впаде).
`app_users` не має аудит-тригера — навісити вже існуючу `trg_write_audit_log_redacted()`
(з T1 Task 10, зараз лише на `students`) новим тригером на `app_users`
(тест: реальний email/ПІБ ніколи не в `audit_logs`). TDD на `createUserWithPermissions`
(forbidden без прав, успіх, дублікат email, невідома роль, service-role-key
ніколи не в `apps/portal`).

### Task 7: Призначення / відкликання ролі

`UserRole` не має `revoked_at`/`revoked_by` (на відміну від `PermissionGrant`) —
без цього «відкликання» вимагало б `DELETE`, порушуючи принцип soft-revoke.
Додати колонки + замінити `@@unique([userId,roleId])` на частковий унікальний
індекс `where revoked_at is null` (raw SQL в міграції, Prisma не вміє частковий
унікальний декларативно) + оновити `refresh_user_effective_scopes()`, додавши
`and ur.revoked_at is null` до всіх JOIN на `user_roles`. Падаючий тест спочатку.
`assign-role.ts`/`revoke-role.ts` — той самий `set_config`-паттерн; guard: не
можна відкликати останню активну роль `director`/`roles.manage` в системі
(інакше система стає некерованою) — `ConflictError`.

### Task 8: Профіль користувача — «ефективні права людини» (вимога спеки §2)

`user_effective_scopes` не містить походження — окремо читати активні `user_roles`
(→role→role_permissions) і активні `permission_grants`, у TS зіставити з рядками
`user_effective_scopes` за тим самим правилом, що й `refresh_user_effective_scopes()`.
Інваріант, який TDD зобов'язаний довести: кожен рядок, показаний на екрані, є 1-в-1
у `user_effective_scopes`, і навпаки. Потрібні нові SELECT-політики на
`permission_grants`/`user_effective_scopes` (аналогічно Task 5). Сторінка —
`Tabs`: Огляд / Ролі / Ефективні права (`Table`: дозвіл / скоуп / джерело-`Badge`).

### Task 9: Деактивація / реактивація користувача

Перемикач `app_users.is_active` (`requireSession` вже фільтрує неактивних).
Заборона самодеактивації (`ConflictError`). `AlertDialog` підтвердження в UI.

---

## GOAL 3 — Повний CRUD учнів

### Task 10: Створення учня + повне редагування базових полів

Розширити `update-student.ts`-паттерн на всі базові поля `Student`
(firstName, lastName, dateOfBirth, livingAddress, criticalNote — без photoPath,
це окрема історія з підписаними URL). Нова `createStudentWithPermissions` —
`requirePermission('students.write', ...)` (глобальний скоуп для створення, бо
щойно створений учень ще не має класу для scoped-перевірки), Zod, привілейований
`prisma.$transaction` + `set_config`. Форма створення — окрема сторінка
`/students/new` (react-hook-form, той самий `Form`-паттерн з Task 3).
`students`-таблиця вже має `trg_write_audit_log_redacted` (T1 Task 10) —
переконатись INSERT теж покритий, не лише UPDATE.

### Task 11: Зарахування — призначення/зміна класу

`enrollments` — немає write RLS, немає UI. Зміна класу = закрити поточний
активний enrollment (`toDate = now()`) + створити новий (`fromDate = now()`,
новий `classId`) в одній транзакції — ніколи UPDATE `classId` на живому рядку
(історія переходів має лишатись читаною). `assign-class.ts` з тим самим
set_config-паттерном; permission check — `requirePermission('students.write',
{type:'class', id: newClassId})` (право на цільовий клас). UI — `Select` класу +
підтвердження в профілі учня.

### Task 12: Опікуни (guardian_persons + guardianships)

Створити нового опікуна (`guardian_persons`: ПІБ, контакти) і зв'язати з учнем
(`guardianships`: тип зв'язку, чи є законним представником) — або зв'язати
існуючого опікуна з іншим учнем (пошук за ПІБ/телефоном, той самий пошуковий
патерн, що `command-menu-actions.ts`'s `searchPeople`). Відв'язка — `deletedAt`
на `guardianships`, не фізичний DELETE. Жодних write-політик — той самий
оркестраційний паттерн. UI в профілі учня: секція «Опікуни» з `Card`-списком +
діалог додавання/зв'язування.

### Task 13: Медичні дані (структуровані + зашифровані нотатки)

Структуровані дані (`student_health` — група здоров'я, фізкультурна група,
алергії-довідник) — звичайний write через privileged-транзакцію (RLS немає,
таблиця вже має власні SELECT-політики з T1 Task 8, права перевіряються
`health.write`/`health.read`). Вільнотекстові нотатки — **виключно** через
`read_health_note`/`write_health_note` (вже існують, шифрування й
`sensitive_access_logs` всередині них, новий код тільки викликає). Ізольована
вкладка в профілі учня, видима лише за `health.read`/`health_notes.read`
(різні дозволи — секція має два незалежні view-guard, не один).

---

## Open Questions (винесено, не вирішено мовчки)

1. ~~Справжньої атомарності між Supabase Auth і Postgres-транзакцією нема —
   компенсаційне видалення best-effort (Task 6). Чи потрібен фоновий job звірки?~~
   **Вирішено 2026-08-07:** best-effort delete + лог, без окремого job.
2. ~~Мінімальна довжина тимчасового пароля директора — пропоновано 12 символів.~~
   **Вирішено 2026-08-07:** 12 символів.
3. Самовідкликання останньої `director`-ролі й самодеактивація заблоковані як
   безпечний дефолт (Tasks 7, 9) — підтвердити явно як бізнес-вимогу.
4. ~~`email_confirm: true` без листа — прийнятно назавжди чи тимчасово до SMTP?~~
   **Вирішено 2026-08-07:** постійне рішення.

## Critical Files (шаблони, що повторюються по всьому плану)

- `apps/admin/src/lib/students/update-student.ts` — канонічний прецедент для
  КОЖНОЇ нової функції запису (Tasks 6, 7, 9, 10, 11, 12, 13).
- `packages/db/prisma/migrations/20260801221754_audit_logs/migration.sql` —
  `trg_write_audit_log_redacted()`, перевикористовується (Tasks 6, 10), не
  переписується.
- `packages/db/prisma/migrations/20260801130500_health_notes_search_path_fix/migration.sql` —
  `read_health_note`/`write_health_note`, викликаються, не дублюються (Task 13).
- `packages/db/test/rls-harness.ts` — `asUser`/`asService`/`createAuthUser`,
  шаблон для кожного нового RLS-тесту.
- `packages/domain/src/permissions.ts` — `requirePermission`/`EffectivePermissions.can`,
  незмінні, використовуються скрізь.
