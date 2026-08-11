# Starland — розширені списки «Користувачі»/«Учні»: дані, дії, серверне сортування й пошук

**Goal:** список `/users` і список `/students` зараз показують мінімум полів,
пошук покриває лише 1-2 колонки, а сортування — фейкове (`DataTableColumnHeader`
сортує тільки вже завантажену сторінку, не весь набір даних через сервер — це
буквально написано в коментарі коду). Довести обидва списки до стану, де видно
все релевантне з моделі даних, доступне для дозволів переглядача, з реальним
пошуком і сортуванням через URL-параметри (як уже зроблено для `q`/`page`).

Жодна з нових таблиць/колонок міграції не потребує — усі RLS read-політики для
`app_users`, `staff_profiles`, `guardianships`, `guardian_persons`, `enrollments`
вже існують з Т1 і плану 2026-08-07. Це суто шар читання й подання, без нового
запису.

## Що свідомо НЕ входить (і чому)

- **Статус оплати навчання** — user попросив, але такого поля/сутності немає
  ніде: ні в `schema.prisma`, ні в `docs/specs/2026-07-31-starland-design.md`,
  ні в `starland-business-logic.md` (там «статус оплати» згадується лише в
  контексті кухні/буфету, T4). За CLAUDE.md §0 — «якщо вимога відсутня в цих
  файлах, її не існує». `TODO(question)`: чи потрібна взагалі підсистема
  оплати навчання і в якій фазі — окреме рішення замовника, не частина цього
  плану.
- **Детальний статус зарахування** (вибув/випускник як окремі стани) —
  `Enrollment.status` існує в схемі, але в коді пишеться лише значення
  `'active'` ([assign-class.ts](../../apps/admin/src/lib/students/assign-class.ts));
  워크-флоу випуску/відрахування ще не реалізовано. Показуємо тільки
  Активний/Неактивний за `toDate` (null/не null) — це все, що система реально
  знає.
- **«+ майбутні поля»** — не існує способу «автоматично» показувати поля,
  яких ще нема в БД. Замість вигаданої динамічної абстракції — звичайний
  явний список колонок, який легко доповнити пізніше (це властивість
  нормального коду, не окрема фіча).

## Global constraints (з CLAUDE.md)

- Дані, гейтовані окремим дозволом (`staff.read` для телефону/посади), не
  рендеряться тим, у кого цього дозволу нема — колонка просто відсутня, а не
  показана й порожня.
- UI-тексти — тільки через `packages/i18n` (`uk`), включно з тими, що зараз
  захардкоджені в `user-profile-content.tsx`.
- `any` заборонено, Zod на межах Server Action (для нової query-side логіки —
  чистих функцій парсингу sort/search — тестуємо напряму, без Zod, бо це не
  межа довіри, а internal URL params з контрольованим набором значень).

---

### Task 1: Прибрати мотлох у шапці картки профілю користувача

`user-profile-content.tsx` — верхній блок (Фото профілю з задизейбленими
Завантажити/Видалити, ID Користувача з попередженням про «історію замовлень»,
поля Ім'я/Контакти як read-only інпути, кнопки Скасувати/Зберегти без
обробників) — декоративний код, скопійований із e-commerce референсу
(satnaing/shadcn-admin) і не адаптований. Видалити весь блок і заголовок
«Редагування користувача / Зміна налаштувань акаунту», лишити компактний
заголовок профілю (ім'я, аватар, статус) і одразу `Tabs` (ролі/ефективні
права/викладання), які й так уже робочі. Ніяких нових рядків i18n для
видаленого тексту не додаємо.

**Commit:** `fix(admin): remove non-functional template scaffold from user profile header`

---

## GOAL 1 — Серверне сортування (спільна інфраструктура)

### Task 2: Sort-параметр в URL замість клієнтського table state

Чиста функція-хелпер `packages/... ` ні — тримаємо у
`apps/admin/src/components/data-table/sort.ts`:
`buildSortHref(searchParams, key, currentSort)` → повертає новий query string
із `sort=<key>&dir=asc|desc` (клік по несортованій — `asc`; по `asc` — `desc`;
по `desc` — знімає сортування, повертає до дефолтного); завжди скидає `page`.
Падаючий тест спочатку (`sort.test.ts`, Vitest, без DOM — чиста функція).

`DataTableColumnHeader` перестає використовувати `column.getIsSorted()`
/`column.toggleSorting()` (це `@tanstack/react-table` client state, який ніколи
не бачив решти сторінок) — приймає `sortKey`, читає `sort`/`dir` з
`useSearchParams()` через `usePathname()+useRouter()`, як уже робить
`DataTableToolbar`. Обидві таблиці (`students-table.tsx`, `users-table.tsx`)
прибирають `getSortedRowModel`.

**Commit:** `refactor(admin): drive column sorting through URL params instead of client table state`

---

## GOAL 2 — Список «Користувачі»

### Task 3: Розширити запит — сортування, пошук по ролі, дані персоналу

`users/page.tsx`:
- `sort` ∈ `fullName|email|status|createdAt|updatedAt` (дефолт `fullName`),
  `dir` ∈ `asc|desc` → `orderBy`.
- Пошук: якщо `q` заданий, окремим запитом знайти `userId`, чиї активні ролі
  мають `role.name` що містить `q` (`userRole.findMany` по
  `role: { name: { contains: q, mode: 'insensitive' } }, revokedAt: null`,
  select `userId`), додати `{ id: { in: matchedIds } }` в `OR`.
- Якщо `session.permissions.can('staff.read')` — довантажити
  `staffProfile.findMany({ where: { userId: { in: ids }, deletedAt: null } })`
  і змапити `phone`/`position` по `userId`.

**Commit:** `feat(admin): sort, search by role, and join staff contact into the users query`

### Task 4: Нові колонки й дії в рядку

`columns.tsx`: додати (умовно, якщо дані передані) колонки «Телефон», «Посада»,
«Створено» (`createdAt`, formatted `Europe/Kyiv`); колонку `actions` —
кнопка-іконка «Переглянути» (лінк на `/users/[id]`) завжди, і
`StatusToggle`-подібна дія деактивації/активації прямо в рядку, видима лише
якщо `session.permissions.can('users.write')` і `user.id !== session.appUserId`
(не можна деактивувати себе — та сама перевірка, що вже є в
[set-active.ts](../../apps/admin/src/lib/users/set-active.ts)). Дія викликає
вже існуючий `setUserActive` server action з `users/actions.ts`, обгорнутий у
той самий `try/catch → ActionResult` маппінг, що в `user-profile-content.tsx`
(винести як спільний хелпер `mapSetActiveError`, а не дублювати).

**Commit:** `feat(admin): add contact columns and inline activate/deactivate to the users list`

### Task 5: i18n

Нові ключі в `packages/i18n/src/uk.ts` (`users.phone`, `users.position`,
`users.createdAt`, …).

**Commit:** `chore(i18n): add users list column labels`

---

## GOAL 3 — Список «Учні»

### Task 6: Розширити запит — сортування, пошук по класу, опікуни, критична нотатка

`students/page.tsx`:
- `sort` ∈ `fullName|bornOn|status` (дефолт `lastName,firstName`), `dir`.
- Пошук: додати в `OR` фільтр по класу через саму relation-фільтрацію Prisma
  (`enrollments: { some: { toDate: null, class: { name: { contains: q,
  mode: 'insensitive' } } } }`) — на відміну від ролей користувача, тут
  зв'язок `Student → Enrollment → Class` є нормальною Prisma-релацією, окремий
  запит не потрібен.
- Довантажити для сторінки: перший активний опікун (`guardianships` де
  `deletedAt: null`, `orderBy: [{ isLegalRepresentative: 'desc' }]`, `take: 1`,
  `include: { person: true }`) і `criticalNote`/`bornOn` — вони вже є в
  `Student`, просто не селектились явно.

**Commit:** `feat(admin): sort, search by class, and load guardian contact into the students query`

### Task 7: Нові колонки

`columns.tsx`: «Дата народження» (і вік поруч, обчислений на сервері — вік
рахуємо відносно `Europe/Kyiv`, не UTC-опівночі), значок критичної нотатки
(`AlertTriangle`, `text-destructive`, `title` з текстом нотатки — та сама
чутливість даних, що вже видно на сторінці учня, нового дозволу не треба),
«Опікун» (ім'я + телефон першого, або «немає» — сам текст через i18n),
«Статус» (`Активний`/`Неактивний` за `enrollment.toDate`).

**Commit:** `feat(admin): add birth date, guardian, critical note and status columns to students list`

### Task 8: i18n

Нові ключі в `uk.ts` (`students.bornOn`, `students.age`, `students.guardian`,
`students.noGuardian`, `students.enrollmentActive`,
`students.enrollmentInactive`, …).

**Commit:** `chore(i18n): add students list column labels`

---

## Definition of Done (з CLAUDE.md §8)

- [ ] `pnpm typecheck && pnpm lint && pnpm test` — вивід показано.
- [ ] Жодна нова колонка не показує дані без відповідного дозволу.
- [ ] UI-тексти — тільки зі словника.
- [ ] Сортування реально сортує весь набір (перевірено вручну: сортувати,
      перейти на сторінку 2, переконатись що порядок наскрізний).
- [ ] `TODO(question)` про статус оплати винесено в кінець цього документа,
      не вирішено мовчки.

## TODO(question)

- Чи потрібна взагалі підсистема оплати навчання (статус, історія платежів)
  і в якій фазі (T2–T4)? Зараз такої сутності немає ні в спеці, ні в схемі.
