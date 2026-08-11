# Starland — повні дані профілю: викладання, персональні дозволи, картка персоналу

**Goal:** Профіль користувача (`/users/[id]`, і його модальний варіант
`@modal/(.)users/[id]`) зараз показує лише `fullName`/`email`/`isActive`/ролі й
read-only «ефективні права». У схемі й у `starland-business-logic.md` §4.5 є ще
три сутності, повʼязані з людиною, які досі не мають жодного UI:
`teaching_assignments` (хто яку пару предмет+клас викладає — джерело scope
`own_teaching`), `permission_grants` (персональні винятки — CLAUDE.md §3 вимагає
повного сліду: хто видав, чому, коли закінчується), `staff_profiles`/
`staff_awards` (картка персоналу). Мета — довести профіль до «повного
контролю»: усе, що є в моделі даних про людину, видно й керовано з одного
екрана, без винятків.

## Global constraints (з CLAUDE.md, повторено для цього плану)

- Жодна з чотирьох таблиць (`teaching_assignments`, `permission_grants`,
  `staff_profiles`, `staff_awards`) не має INSERT/UPDATE/DELETE RLS-політики —
  лише SELECT (T1 Task 8-9). Усі записи йдуть через привілейований `prisma` +
  `requirePermission(...)` + `set_config('request.jwt.claims', ...)` у
  транзакції — той самий шаблон, що
  [`assign-class.ts`](../../apps/admin/src/lib/students/assign-class.ts).
  RLS SELECT-тести для цих таблиць уже існують із T1 — новий TDD тут покриває
  лише доменні функції запису (forbidden/success/конфлікт/not-found), не SQL.
- Фізичних видалень немає ніде в цьому плані: скрізь `deletedAt`/`revokedAt`.
- Дозволи вже існують у сіді, нових кодів не додаємо:
  `staff.write` (teaching assignments — читання цієї таблиці вже прив'язане до
  `staff.read`, не `classes.read`, тож писати логічно через `staff.write`),
  `roles.manage` (видача персональних дозволів — його опис у сіді буквально
  «Призначення ролей **і видача дозволів**»).
- UI-тексти — нові ключі в `packages/i18n/src/uk.ts` (секція `users` або нова
  `staff`), не хардкод.
- `PersonLink`/новий `/users/[id]`-модал використовується скрізь, де на екрані
  зʼявляється «ким видано» — не голий UUID.

---

## GOAL A — Викладацькі призначення (`teaching_assignments`)

### Task 1: Вкладка «Викладання» — перегляд

Нова вкладка в `UserProfileContent` (`Tabs`): список активних
(`deletedAt: null`) `teaching_assignments` цього користувача — предмет, клас,
період. Читання через `withUserContext` (RLS `teaching_assignments_read` уже
існує). Порожній стан — якщо не викладає нічого.

### Task 2: Призначити / відкликати викладання

`apps/admin/src/lib/staff/assign-teaching.ts`:
`assignTeachingWithPermissions(permissions, actor, {teacherUserId}, raw)` —
Zod `{subjectId: uuid, classId: uuid, periodId: uuid}`,
`requirePermission(permissions, 'staff.write')`, перевірка існування
subject/class/period (`NotFoundError`), дублікат (`@@unique([teacherUserId,
subjectId, classId, periodId])`) → `ConflictError`.
`revokeTeachingWithPermissions(...)` — `deletedAt = now()` (колонка вже є в
моделі, нової міграції не треба для самого поля).

Міграція: додати аудит-тригер `teaching_assignments_audit` на
`trg_write_audit_log()` (та сама функція з T1 Task 10, зараз навішена на
`permission_grants`/`user_roles`/`students`) — призначення викладання це зміна
доступу (визначає `own_teaching` scope), CLAUDE.md §3 вимагає слід на кожну
таку зміну. Падаючий тест на аудит-запис спочатку, потім міграція.

TDD на обидві функції: forbidden без `staff.write`, успіх, дублікат,
`NotFoundError` на неіснуючий subject/class/period. Тригер
`teaching_assignments_refresh_scopes` (T1) уже перераховує
`user_effective_scopes` — нового коду для цього не треба.

UI: `Select` для предмета/класу/періоду (ті самі RLS-читані джерела, що вже
використовує `class-assign.tsx` для класів), кнопка «Призначити», `AlertDialog`
на відкликання — той самий патерн, що `RolesTab`.

---

## GOAL B — Персональні дозволи (`permission_grants`)

### Task 3: «Ким і коли» на вкладці «Ефективні права»

`getEffectivePermissionsProfile` уже обчислює `grantedBy`/`expiresAt` для
grant-джерел, але UI їх не показує — і взагалі не передає `grantedBy`/
`createdAt` для role-джерел (хоча `userRole.grantedBy`/`createdAt` уже
вибираються запитом, просто не прокидаються в `PermissionOrigin`). Розширити
`PermissionOrigin` обома полями для обох варіантів (`type: 'role'` і
`type: 'grant'`), одним запитом резолвити всі унікальні `grantedBy` UUID у
`fullName` (`tx.appUser.findMany({where:{id:{in:[...]}}})`), рендерити як
`PersonLink` + дата, не голий UUID.

### Task 4: Видати / відкликати персональний дозвіл

`apps/admin/src/lib/users/grant-permission.ts`:
`grantPermissionWithPermissions(permissions, actor, {userId}, raw)` — Zod
`{permissionCode: string, reason: string.min(10), expiresAt: date.optional()}`,
`requirePermission(permissions, 'roles.manage')`, `effect` фіксовано `'allow'`
і `scopeType` фіксовано `'global'` у цій версії — scope-специфічні гранти
(на конкретний клас/учня/предмет) вимагають універсального пікера сутності,
якого зараз ніде в адмінці немає; лишаю це за межами плану й позначаю
`TODO(question)`: чи взагалі потрібні `deny`-гранти й scope-специфічні
`allow`-гранти через UI, чи глобальний `allow` з причиною й терміном дії —
достатньо для реальних кейсів (тимчасовий доступ комусь поза роллю)?
`revokePermissionGrantWithPermissions(...)` — `revokedAt`/`revokedBy`, той
самий патерн, що відкликання ролі (Task 7 попереднього плану).
Аудит-тригер на `permission_grants` уже є (T1 Task 10) — нового не треба.

TDD: forbidden без `roles.manage`, успіх, невідомий `permissionCode` →
`NotFoundError`, `expiresAt` у минулому → Zod-помилка.

UI: нова секція на вкладці «Ролі» (перейменувати на «Ролі та дозволи») —
форма видачі (`Select` дозволу, `Textarea` причини, дата) + список активних
грантів із причиною/терміном/ким видано + відкликання.

---

## GOAL C — Картка персоналу (`staff_profiles` + `staff_awards`)

### Task 5: Вкладка «Персонал» — перегляд і редагування

`apps/admin/src/lib/staff/update-staff-profile.ts`:
`updateStaffProfileWithPermissions(permissions, actor, {userId}, raw)` —
upsert (`StaffProfile.userId` унікальний, профіль може ще не існувати), Zod
`{phone: string.optional(), category: string.optional(), experienceYears:
int.min(0).optional(), position: string.optional()}`,
`requirePermission(permissions, 'staff.write')`. Аудит-тригер навмисно НЕ
додаю — це описові кадрові дані, не зміна доступу (на відміну від Goal A), під
інваріанти CLAUDE.md §3 не підпадає; якщо це рішення неправильне — скажи, і
додам той самий `trg_write_audit_log()`.

TDD: forbidden без `staff.write`, успіх create (профілю ще нема), успіх update
(профіль є), `experienceYears` від'ємний → Zod-помилка.

### Task 6: Нагороди — додавання й м'яке видалення

`staff_awards` зараз без `deletedAt` — потрібна міграція (нова колонка,
`nullable`, за конвенцією §4 «де є видалення — `deleted_at`, а не `DELETE`»).
Падаючий тест на soft-delete спочатку, потім міграція + оновлення
`packages/db/prisma/schema.prisma`.

`apps/admin/src/lib/staff/manage-awards.ts`: `addAwardWithPermissions(...)` —
Zod `{title: string.min(1), awardedOn: date}`, `requirePermission(permissions,
'staff.write')`; `removeAwardWithPermissions(...)` — `deletedAt = now()`.

TDD: forbidden без `staff.write`, успіх додавання, успіх soft-delete, видалена
нагорода не показується в списку.

UI: список нагород (назва + дата) на вкладці «Персонал», кнопка «Додати
нагороду» (діалог), soft-delete з `AlertDialog`-підтвердженням — той самий
патерн, що відкликання ролі.

---

## Порядок виконання

Один Task = один коміт, TDD (падаючий тест → код → зелений тест), typecheck +
lint + test виводом перед переходом до наступного. Goal A → Goal B → Goal C —
у цьому порядку, бо A найкритичніший для scope-моделі, C найменш ризикований.
