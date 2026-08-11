# Starland — уніфікація модалок профілю/створення, вкладки людини, картка персоналу без акаунта

**Goal:** зараз кожна сутність (`users`, `students`, `staff`) має по дві різні
візуальні реалізації одного екрана — «справжню» сторінку (plain `<div>`/`Card`,
відкривається при прямому переході чи хард-релоаді) і перехоплену модалку
(`@modal/(.)...`, відкривається при кліку зі списку). Це і є джерело плутанини
з попередньої розмови: немає єдиного місця «як виглядає профіль людини». Ціль
цього плану — залишити рівно одну візуальну реалізацію (модалку) для кожного
`/new` і `/[id]`, добудувати відсутню картку `/staff/[id]` для співробітників
без акаунта (прогалина, зафіксована як `TODO(question)` у
[2026-08-10-staff-and-status-model.md](2026-08-10-staff-and-status-model.md),
Task 5), і навести лад у вкладках профілю користувача.

**Контекст рішень (з розмови 2026-08-10):**
- «Журнал дій» показує агрегований слід людини: власні зміни `app_users` +
  прив'язаного `employees` + `user_roles` + `permission_grants` +
  `teaching_assignments`, а не тільки один рядок.
- `/staff/[id]` будуємо зараз, а не відкладаємо.
- Вкладка «Викладання» показується, якщо є право призначати (`staff.write`)
  АБО в людини вже є активні призначення — не всім підряд.
- **Тільки модалка, без окремої сторінки-заглушки.** Next.js App Router все
  одно вимагає файл `page.tsx` на кожному маршруті (інакше URL не резолвиться
  взагалі) — це обмеження фреймворка, не дизайн-рішення. Але цей `page.tsx`
  рендерить **той самий** компонент модалки, що й перехоплена версія — жодного
  окремого «повносторінкового» вигляду з іншим layout не існує. Пряме
  посилання, хард-релоад і клік зі списку виглядають однаково.

## Рішення й обґрунтування

- **`ProfileModal` закривається через `router.push(closeHref)`, а не
  `router.back()`.** Поточний коментар у `profile-modal.tsx` сам визнає
  крихкість `back()` (Next не завжди міняє `@modal`-слот назад на
  `default.tsx` при soft-navigation). `back()` додатково ненадійний, коли
  модалка відкрита прямим переходом чи хард-релоадом — у вкладці може не бути
  «попередньої» сторінки в межах застосунку. `closeHref` — завжди відомий і
  явний (список, з якого ця сутність): `/users`, `/students`, `/staff`.
- **Один спільний контент-компонент на сутність**, як уже зроблено для
  `UserProfileContent` — рендериться і з реального `page.tsx`, і з
  `@modal/(.)…/page.tsx`. Різниця між ними — лише обгортка (`ProfileModal`),
  ніколи не сам контент.
- **`students/[id]/edit` зникає як окремий маршрут.** За тим самим правилом
  «нема окремих slug-сторінок для CRUD» і за CLAUDE.md §6 («кожен екран існує
  в `view`/`edit`, залежно від дозволів») редагування учня стає перемиканням
  режиму всередині тієї самої модалки — так само, як `GeneralTab` користувача
  вже редагує `fullName` inline, без переходу на іншу сторінку.
- **`/staff/[id]` існує лише для employee без `userId`.** Коли `userId` є,
  `PersonLink` веде на `/users/[id]` (це вже так у `staff/columns.tsx`) —
  профіль людини з акаунтом лишається один, у `/users`, з вкладкою
  «Персонал» для кадрових даних (уже реалізовано). `/staff/[id]` — картка
  для People без входу в систему: кадрові поля (те, що зараз у `StaffTab`,
  без прив'язки до `AppUser`) + «Журнал дій». Без «Ролі», «Ефективні права»,
  «Викладання» — це вкладки облікового запису, якого тут немає.
- **`StaffTab`-контент (форма посади/статусу/нагород) стає спільним
  компонентом**, що приймає `employeeId` замість неявного виведення з `userId`
  — використовується і в `/users/[id]`, і в `/staff/[id]`.
- **«Журнал дій» — окремий спільний компонент** (`activity-log-tab.tsx`),
  що приймає вже змаплені рядки `{action, entityType, occurredAt, actorId,
  actorName}` — сама агрегація і дозвіл (`audit.read`) рахуються на сервері
  для кожної сутності окремо (у `user-profile-content.tsx` і в новому
  `staff-profile-content.tsx`), бо набір `entity_type`/`entity_id` для людини
  з акаунтом і без нього різний.

## Global constraints (з CLAUDE.md, повторено для цього плану)

- UI-тексти — нові ключі `packages/i18n/src/uk.ts`, не хардкод.
- Немає дозволу → елемент не рендериться (не рендериться-і-падає).
- Один Task = один коміт; typecheck + lint + test виводом перед комітом.
- `audit_logs` містить `[REDACTED]` для `app_users`/`employees`/`students` —
  UI показує тип дії й що саме змінилось (ключі полів), не значення.
- Жодних нових таблиць/міграцій у цьому плані — усе читає вже наявні
  `audit_logs`, `employees`, `app_users` (RLS і тригери вже на місці).

---

## Task 1: `ProfileModal` — детермінований close, без `router.back()`

**Files:** Modify `apps/admin/src/components/profile-modal.tsx`, усі виклики
(`@modal/(.)…/page.tsx` — додається проп `closeHref`).

- [ ] **Крок 1:** `ProfileModal` приймає `closeHref: string` замість покладання
  на `router.back()`; `handleOpenChange(false)` → `setOpen(false)` +
  `router.push(closeHref)`.
- [ ] **Крок 2:** оновити 4 існуючі виклики (`(.)users/[id]`, `(.)users/new`,
  `(.)students/new`, `(.)staff/new`) — передати відповідний `closeHref`
  (`/users` або `/students` або `/staff`).
- [ ] **Крок 3:** ручна перевірка — закриття модалки з прямого переходу
  (вставити URL у нову вкладку, натиснути X) веде на список, не на `about:blank`
  чи попередній чужий сайт.
- [ ] **Крок 4:** typecheck + lint, commit
  `refactor(admin): close profile modal via explicit closeHref, not router.back()`.

## Task 2: Реальні `page.tsx` рендерять ту саму модалку, не окремий layout

**Files:** Modify `users/[id]/page.tsx`, `users/new/page.tsx`,
`students/new/page.tsx`, `staff/new/page.tsx`.

- [ ] **Крок 1:** кожен із цих `page.tsx` викликає `ProfileModal` +
  відповідний `*Content` компонент — точно як його `@modal`-двійник. Прибрати
  бespoke обгортки (`<div className="flex flex-col gap-8 max-w-4xl">` з
  «Назад до списку», голий `<Card>` тощо).
- [ ] **Крок 2:** typecheck + lint + наявні тести (`pnpm --filter
  @starland/admin test`) — жоден існуючий тест не мав залежати від конкретного
  layout цих сторінок; якщо залежав — оновити тест під нову структуру, не
  поведінку.
- [ ] **Крок 3:** commit
  `refactor(admin): render user/student/staff creation and profile pages through the shared modal chrome`.

## Task 3: Модалізувати `/students/[id]`, прибрати `/students/[id]/edit`

**Files:** Create `students/[id]/student-profile-content.tsx`,
`@modal/(.)students/[id]/page.tsx`. Modify `students/[id]/page.tsx` (стає
тонкою обгорткою як `users/[id]/page.tsx`), `edit-student-form.tsx` (переїжджає
у вкладку/секцію inline-редагування всередині `student-profile-content.tsx`,
за зразком `GeneralTab`). Delete `students/[id]/edit/*`.

- [ ] **Крок 1:** винести весь наявний вміст `students/[id]/page.tsx`
  (профіль, опікуни, вимірювання, здоров'я) у `StudentProfileContent` —
  чиста передача пропсів, без зміни серверної логіки (`requireSession`,
  `withUserContext`, перевірки прав лишаються як є).
- [ ] **Крок 2:** секція «Профіль» отримує режим редагування inline
  (кнопка «Редагувати» → форма замість `<dl>`, Save/Cancel), логіка з
  `EditStudentForm` переноситься сюди, `submitAction` лишається
  `updateStudent(id, raw)` — контракт Server Action не змінюється.
- [ ] **Крок 3:** `@modal/(.)students/[id]/page.tsx` — `ProfileModal` +
  `StudentProfileContent`, той самий шаблон, що `(.)users/[id]`.
- [ ] **Крок 4:** видалити `students/[id]/edit/page.tsx`,
  `edit-student-form.tsx`, посилання на `/students/{id}/edit` в
  `students/columns.tsx` (якщо є) замінити на відкриття модалки в
  режимі редагування.
- [ ] **Крок 5:** `pnpm --filter @starland/admin test`, typecheck, lint —
  вивід перед комітом.
- [ ] **Крок 6:** commit
  `refactor(admin): move student profile view/edit into the shared modal, drop the standalone edit route`.

## Task 4: «Нагороди» — окрема вкладка

**Files:** Create `users/[id]/awards-tab.tsx` (виносить блок нагород із
`staff-tab.tsx` без зміни логіки — той самий `awards`/`addAwardAction`/
`removeAwardAction`). Modify `staff-tab.tsx` (прибрати блок нагород),
`user-profile-content.tsx` (нова `TabsTrigger`/`TabsContent`, гейт —
той самий `canViewStaff`, що й «Персонал»), `packages/i18n/src/uk.ts`
(`users.awardsTab`).

- [ ] **Крок 1:** перенести JSX + state нагород у `AwardsTab`, без зміни
  Server Actions (`addAward`/`removeAward` уже існують).
- [ ] **Крок 2:** додати вкладку в `user-profile-content.tsx` поруч із
  «Персонал», під тим самим `canViewStaff`.
- [ ] **Крок 3:** типчек/лінт/тест, commit
  `refactor(admin): split staff awards into their own profile tab`.

## Task 5: Вкладка «Викладання» — показ лише коли релевантна

**Files:** Modify `user-profile-content.tsx`.

- [ ] **Крок 1:** обгорнути `TabsTrigger`/`TabsContent` для `teaching` умовою
  `canManageStaff || teachingAssignments.length > 0` (той самий патерн, що вже
  є для `canViewStaff`).
- [ ] **Крок 2:** ручна перевірка — профіль охоронця/бухгалтера без призначень
  і без прав на призначення вкладки не показує; профіль директора (є право)
  показує навіть без призначень.
- [ ] **Крок 3:** типчек/лінт/тест (наявний тест на цю сторінку, якщо є,
  оновити очікування), commit
  `fix(admin): hide the teaching tab from profiles with nothing to show there`.

## Task 6: Вкладка «Журнал дій»

**Files:** Create `apps/admin/src/components/activity-log-tab.tsx` (чистий
презентаційний компонент — таблиця: дія, тип сутності, хто, коли), Create
`apps/admin/src/lib/audit/get-person-activity-log.ts` (агрегує
`prisma.auditLog.findMany` по масиву `{entityType, entityId}`, сортує за
`createdAt desc`, резолвить `userId` → `PersonLink` через уже наявний патерн
`grantedByNameById`). Modify `user-profile-content.tsx` (нова вкладка, збір
`{entityType:'app_users', entityId:user.id}` + за наявності employee
`{entityType:'employees', entityId:employee.id}` + `user_roles`/
`permission_grants`/`teaching_assignments` рядки, де `entityId` належить цій
людині), `packages/i18n/src/uk.ts` (`users.activityLogTab`, назви дій).

- [ ] **Крок 1:** падаючий тест на `getPersonActivityLog` —
  `forbidden` без `audit.read`, повертає змішані рядки з кількох
  `entity_type`, відсортовані за часом, `[REDACTED]`-значення не
  парсяться/не показуються як plain text полів (лише перелік змінених
  ключів).
- [ ] **Крок 2:** реалізація, гейт `session.permissions.can('audit.read')` —
  вкладка не рендериться без права (CLAUDE.md §6).
- [ ] **Крок 3:** підключити в `user-profile-content.tsx`.
- [ ] **Крок 4:** `pnpm --filter @starland/admin test`, typecheck, lint.
- [ ] **Крок 5:** commit
  `feat(admin): add an aggregated activity-log tab to the person profile`.

## Task 7: `/staff/[id]` — картка співробітника без акаунта

**Files:** Create `staff/[id]/page.tsx`, `staff/[id]/staff-profile-content.tsx`,
`@modal/(.)staff/[id]/page.tsx`. Modify `staff/columns.tsx` (посилання для
рядків без `userId` — `PersonLink kind="staff" id={employee.id}` замість
plain text), `users/[id]/staff-tab.tsx` → перейменувати/узагальнити в
спільний `employee-profile-fields.tsx`, що приймає `employeeId` й
використовується і тут, і в `/users/[id]`.

- [ ] **Крок 1:** `StaffProfileContent` — `requireSession()` +
  `can('staff.read')`, `tx.employee.findUnique({ where: { id }, ...})`
  (не `userId` — прямий `id`, бо саме для цього маршруту акаунта нема),
  `notFound()` якщо немає або є `userId` (тоді канонічний профіль — `/users/[id]`,
  редірект туди).
- [ ] **Крок 2:** дві вкладки — кадрові поля (спільний компонент з Task, що
  раніше був `StaffTab`) + «Журнал дій» (`entityType: 'employees', entityId`).
  Без «Ролі»/«Ефективні права»/«Викладання» — нема облікового запису.
- [ ] **Крок 3:** `@modal/(.)staff/[id]/page.tsx` за тим самим шаблоном.
- [ ] **Крок 4:** `staff/columns.tsx` — рядок без `userId` стає клікабельним
  на `/staff/{employee.id}` (закриває коментар-TODO у файлі й
  `TODO(question)` із `2026-08-10-staff-and-status-model.md`).
- [ ] **Крок 5:** тест на гейт (без `staff.read` — `redirect`), typecheck,
  lint.
- [ ] **Крок 6:** commit
  `feat(admin): add a profile page for staff without a login account`.

---

## Порядок виконання

Task 1 → 2 → 3 (модальна інфраструктура спочатку, решта на ній стоїть) →
4 → 5 → 6 → 7. Task 4/5/6 незалежні між собою, можна міняти місцями. Task 7
залежить від Task 6 (спільний `activity-log-tab.tsx`) і від винесення
кадрових полів у Task 7 Крок 1 (реюз того, що раніше було `StaffTab`).
