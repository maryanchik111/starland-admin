# Starland — клас і батьківська згода у формі учня

**Goal:** форма створення учня приймає рівно те, що дозволяє
`CreateStudentInput` — ПІБ, дату народження, адресу, критичну нотатку. Клас не
можна вибрати одразу (окремий крок після створення), а батьківська згода
(`parentalConsentGivenAt`/`parentalConsentEnteredBy` — уже є в схемі `students`)
не показана взагалі ніде, ні при створенні, ні при редагуванні. Цей план
закриває обидва пробіли, не послаблюючи перевірку прав на клас.

## Рішення й обґрунтування

- **Клас лишається окремим правом, але стає опціональним кроком у тій самій
  формі, не окремим маршрутом.** Створення учня вимагає глобального
  `students.write`; призначення в клас — того самого дозволу, але
  **скоупованого на конкретний клас** (`assignClassWithPermissions`). Форма
  показує спискок класів, доступних поточному користувачу (уже є такий
  розрахунок на `students/[id]/page.tsx` — `availableClasses`), і submit
  виконує два виклики Server Action послідовно: `createStudent`, потім (якщо
  клас вибрано) `assignClass(newId, {classId})`. Обидва — з тими самими
  перевірками, що й зараз; нічого не обходиться.
  - Якщо перший виклик успішний, а другий (`assignClass`) впав — учень уже
    створений без класу, форма показує помилку призначення окремо від
    помилки створення і лишає користувача на сторінці нового учня
    (`/students/{id}`), а не втрачає створений запис. Не транзакція на два
    Server Actions одразу (вони вже в різних БД-транзакціях), тому
    компенсації «відкату створення» немає — і не повинно бути: студент без
    класу — валідний проміжний стан (та сама модель, що вже існує сьогодні).
- **`parentalConsentEnteredBy` пишеться сервером із поточного `AppUser`, не
  приймається з форми** — той самий патерн, що `StudentMeasurement.enteredBy`
  (`entered_by` = актор, не поле форми). Юридично підстава згоди — хто саме
  зафіксував, а не довільне значення з клієнта.
- **`photoPath` — поза скоупом цього плану** (потребує Storage-бакета й
  signed-URL потоку, окрема задача).

## Global constraints (з CLAUDE.md)

- Zod на межі Server Action; жодного нового `any`.
- UI-тексти — нові ключі `packages/i18n/src/uk.ts`.
- Дозволи перевіряються там само, де й зараз (`requirePermission` у
  `lib/students/*`) — форма лише показує/ховає елементи за тими самими
  правилами, дозвіл — не UI-рішення.
- Один Task = один коміт, TDD для доменних функцій.

---

## Task 1: Опціональний клас у формі створення учня

**Files:** Modify `apps/admin/src/app/(app)/students/new/create-student-form.tsx`,
`apps/admin/src/app/(app)/students/new/new-student-content.tsx`
(передати `availableClasses`, порахувати як на `students/[id]/page.tsx`),
`apps/admin/src/app/(app)/students/actions.ts` (або новий
`submitCreateStudentWithClass`, що виконує `createStudent` → за наявності
`classId` → `assignClass`).

- [ ] **Крок 1:** `NewStudentContent` рахує `availableClasses` — той самий
  запит/фільтр, що вже є в `students/[id]/page.tsx` (`prisma.class.findMany`
  + фільтр по `session.permissions.can('students.write', {type:'class', id})`).
- [ ] **Крок 2:** форма отримує опціональний `Select` класу (плейсхолдер
  «Без класу» — якщо немає жодного доступного класу, елемент не рендериться
  зовсім, не порожній список).
- [ ] **Крок 3:** обробник submit — `createStudent`, тоді за наявності
  `classId` — `assignClass(id, {classId})`; помилка другого кроку показує
  toast з посиланням «учня створено, клас не призначено» і веде на
  `/students/{id}` (де клас можна призначити тим самим `ClassAssign`, що вже
  є).
- [ ] **Крок 4:** тест на happy path (з класом і без) — Playwright чи
  ручна перевірка (форма клієнтська, доменна логіка вже покрита тестами
  `create-student`/`assign-class`).
- [ ] **Крок 5:** typecheck, lint, `pnpm --filter @starland/admin test`,
  commit `feat(admin): let student creation assign a class in one step`.

## Task 2: Батьківська згода — поле в create + edit

**Files:** Modify `apps/admin/src/lib/students/create-student-schema.ts`
(`parentalConsentGivenAt: z.coerce.date().optional()`),
`apps/admin/src/lib/students/create-student.ts` (при наявності — записати
`parentalConsentEnteredBy` з `actor`, розв'язаного до `app_users.id`, за тим
самим патерном, що вже вирішує `authUserId → app_users.id` десь у
`lib/students/*`), `update-student.ts` (той самий приймач, той самий запис
`enteredBy` при кожній зміні значення), форми (`create-student-form.tsx`,
секцію inline-редагування учня з Task 3
[2026-08-10-unified-profile-modals.md](2026-08-10-unified-profile-modals.md)),
`packages/i18n/src/uk.ts` (`students.parentalConsent`, `students.consentGivenOn`,
`students.consentEnteredBy`).

- [ ] **Крок 1:** падаючий тест — `updateStudentWithPermissions` записує
  `parentalConsentGivenAt` і `parentalConsentEnteredBy` (останній ігнорує
  будь-яке значення з `raw`, завжди береться з `actor`).
- [ ] **Крок 2:** реалізація в `create-student.ts`/`update-student.ts`.
- [ ] **Крок 3:** UI-поле (дата) у формі створення й у секції профілю учня;
  показ «зафіксовано ⟨ПІБ через PersonLink⟩ ⟨дата⟩», якщо значення є (§6:
  будь-яка згадка людини — клікабельна).
- [ ] **Крок 4:** тести, typecheck, lint, commit
  `feat(admin): add parental consent tracking to student profile and creation`.

---

## Порядок виконання

Task 1 і Task 2 незалежні. Task 2 (поле в inline-редагуванні профілю)
логічно йде після Task 3 [unified-profile-modals](2026-08-10-unified-profile-modals.md)
(inline-редагування учня), інакше додається в застарілий `edit-student-form.tsx`,
який той план видаляє.
