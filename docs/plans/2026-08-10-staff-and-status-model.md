# Starland — модель працівника, статуси зарахування/зайнятості, реєстр наказів

**Goal:** директорський огляд каркасу (T1) виявив три конкретні прогалини:
`enrollments.status` існує в схемі, але ніде не використовується (весь UI
визначає «активний/неактивний» лише з `to_date`), `staff_profiles` вимагає
обов'язковий обліковий запис (`user_id NOT NULL`), тому працівників без
логіна — охорону, кухню, прибиральниць — завести в систему неможливо, і немає
жодного місця, де фіксується юридична підстава (наказ) зміни статусу учня чи
співробітника. Цей план закриває всі три, додає сторінку «Персонал» і фіксує
дизайн (без коду) для відпусток/лікарняних і трекінгу робочого часу
непедагогічного персоналу — на розсуд користувача, ці дві речі заплановані під
T2/T4, а не будуються зараз.

**Статус виконання (2026-08-10):** Task 1–5 виконано (schema/migration/domain
/UI, typecheck+lint+test зелені — вивід у супровідній розмові). Design-note —
готовий, без коду, за задумом. Employee-без-акаунта: схема готова
(`user_id` nullable), UI створення такого запису поки не побудовано —
`/staff` тільки читає.

## Рішення й обґрунтування

- **`Employee` замість `StaffProfile`** (`employees` замість `staff_profiles`,
  перейменування таблиці, не drop+create — дані зберігаються). `user_id` стає
  **опціональним**. Employee отримує власні `first_name`/`last_name`/`phone`/
  `email` — та сама модель, що вже existує для батьків (`guardian_persons`
  живе незалежно від `app_users`, лінкується до порталу пізніше). Коли
  `user_id` заповнений, UI підставляє ім'я з `app_users.full_name` як
  зручність при створенні картки, але `Employee` лишається окремим,
  редагованим незалежно записом — так само, як `guardian_persons` уже
  розходиться з `app_users` у цьому кодбейзі. Підтверджено користувачем.
- **`staff_positions` — таблиця-довідник**, бо посади — це саме те, що
  директор додає без релізу (CLAUDE.md §4: «довідники — дані в таблицях, не
  enum у коді»), на відміну від статусів нижче.
- **`EnrollmentStatusKind`, `EmploymentStatusKind`, `OrderKind` — Postgres
  enum, не таблиці.** Ці набори значень юридично зафіксовані (трудове право,
  порядок зарахування/відрахування) і не є тим, що директор редагує зі свого
  UI — той самий клас рішення, що вже прийнятий у схемі для
  `CalendarDayKind` (канікули/дистанційний/іспит — теж enum, не таблиця).
  Якщо це припущення невірне (директор захоче додавати власні статуси) —
  сказати, і Task 1 переробляється на таблицю без зміни решти плану.
- **`school_orders` — єдиний реєстр наказів** для обох сутностей
  (`enrollments.status_order_id`, `employees.status_order_id`), а не окремі
  таблиці на кожну — номер і дата наказу однаково влаштовані для зарахування,
  відрахування, звільнення, відпустки.
- Нових кодів дозволів не додаємо: зміна статусу учня йде під `students.write`,
  зміна статусу/картки працівника — під `staff.write` (уже існують і засіяні).

## Global constraints (з CLAUDE.md, повторено для цього плану)

- RLS на кожній новій таблиці в тій самій міграції, що й таблиця.
- Довідники (`staff_positions`) — один спільний тест «без сесії не видно
  нічого, з сесією видно». `school_orders` — таблиця зі скоупованим доступом
  (містить причини кадрових/учнівських рішень) → позитивний і негативний тест
  на роль.
- Фізичних видалень немає: `deleted_at` скрізь, де можливе видалення.
- Кожна зміна статусу учня/працівника — запис в `audit_logs` (CLAUDE.md §3:
  «кожна зміна оцінки, відвідуваності, доступу, ролі» — статус зайнятості й
  зарахування такого ж калібру рішення).
- UI-тексти — нові ключі в `packages/i18n/src/uk.ts`, не хардкод (сама
  причина, чому цей план існує — минулий крок це порушив у вкладці
  «Загальні», окремо виправлено поза цим планом).
- Один Task = один коміт, TDD (падаючий тест → код → зелений тест), typecheck
  + lint + test виводом перед переходом до наступного.

---

## Task 1: Довідник посад і enum-статуси

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/*_staff_positions_and_status_enums/migration.sql`, `packages/db/prisma/seed/staff-positions.ts`, `packages/db/test/staff-positions.test.ts`

**Interfaces:**
- Consumes: T1 (existing `staff_profiles`, `enrollments`)
- Produces: таблиця `staff_positions` (код, назва, `is_teaching`), enum-и
  `enrollment_status_kind`, `employment_status_kind`, `order_kind`

- [ ] **Step 1: Падаючий тест на довідник**

```ts
describe('staff positions', () => {
  it('is empty for an unauthenticated session and seeded for an authenticated one', async () => {
    const anon = await asService((c) => c.query('select 1')) // baseline, RLS перевіряється нижче
    const authId = await createAuthUser(`pos-${Date.now()}@starland.test`)
    const rows = await asUser(authId, (c) => c.query('select code from staff_positions order by code'))
    expect(rows.rows.map((r) => r.code)).toContain('teacher')
  })
})
```

- [ ] **Step 2:** `pnpm --filter @starland/db test staff-positions` → FAIL (таблиці нема)

- [ ] **Step 3: Схема**

```prisma
enum EnrollmentStatusKind {
  active
  transferred_internal
  withdrawn
  graduated
  expelled
  academic_leave

  @@map("enrollment_status_kind")
}

enum EmploymentStatusKind {
  working
  vacation
  sick_leave
  maternity_leave
  unpaid_leave
  dismissed

  @@map("employment_status_kind")
}

enum OrderKind {
  enrollment
  exclusion
  graduation
  transfer
  hiring
  dismissal
  leave
  award

  @@map("order_kind")
}

model StaffPosition {
  code       String    @id
  name       String
  isTeaching Boolean   @default(true) @map("is_teaching")
  deletedAt  DateTime? @map("deleted_at") @db.Timestamptz
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt  DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  @@map("staff_positions")
}
```

- [ ] **Step 4: Міграція + RLS + сід у міграції**

```sql
alter table staff_positions enable row level security;

create policy staff_positions_read on staff_positions
  for select using (auth.uid() is not null);

insert into staff_positions (code, name, is_teaching) values
  ('teacher', 'Вчитель', true),
  ('mentor', 'Класний керівник', true),
  ('psychologist', 'Психолог', true),
  ('speech_therapist', 'Логопед', true),
  ('nurse', 'Медсестра', true),
  ('director', 'Директор', false),
  ('deputy_director', 'Заступник директора', false),
  ('admin', 'Адміністратор', false),
  ('secretary', 'Секретар', false),
  ('accountant', 'Бухгалтер', false),
  ('facilities_manager', 'Завгосп', false),
  ('security_guard', 'Охорона', false),
  ('cleaner', 'Прибиральниця', false),
  ('cook', 'Кухар', false),
  ('librarian', 'Бібліотекар', false),
  ('it_specialist', 'IT-спеціаліст', false)
on conflict (code) do nothing;
```

`is_teaching` — прапорець, від якого пізніше залежить атестаційний цикл і
норми робочого часу (design-note нижче), а не тільки довідкова інформація.

- [ ] **Step 5:** застосувати, `pnpm --filter @starland/db test staff-positions` → PASS
- [ ] **Step 6: Commit** `feat(db): add staff positions catalog and status enums`

---

## Task 2: Реєстр наказів (`school_orders`)

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/*_school_orders/migration.sql`, `packages/db/test/school-orders.test.ts`

**Interfaces:**
- Consumes: Task 1
- Produces: таблиця `school_orders(number, issued_on, kind, title, file_path, created_by, deleted_at)`

- [ ] **Step 1: Падаючий тест** — RLS: без `staff.write`/`students.write` не читає, з дозволом читає; наказ ніколи фізично не видаляється (перевірка, що видалення = `deleted_at`, немає ORM-методу `delete`).
- [ ] **Step 2:** FAIL — relation не існує
- [ ] **Step 3: Схема**

```prisma
model SchoolOrder {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  number    String
  issuedOn  DateTime  @map("issued_on") @db.Date
  kind      OrderKind
  title     String
  filePath  String?   @map("file_path")
  createdBy String    @map("created_by") @db.Uuid
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  @@index([kind, issuedOn])
  @@map("school_orders")
}
```

`file_path` — шлях у приватному бакеті (скан наказу), за тим самим правилом,
що фото людей (§4.15 спеки): не URL у базі, підписаний лінк на 5 хв при показі.
Бакет `school-documents` створюється в цій-таки міграції (`insert into
storage.buckets ... values ('school-documents', 'school-documents', false)`).

- [ ] **Step 4: RLS**

```sql
alter table school_orders enable row level security;

create policy school_orders_read on school_orders
  for select using (has_scope('staff.read', 'global') or has_scope('students.read', 'global'));
```

Читання наказів — те саме коло людей, що вже бачить кадрові/учнівські дані;
окремого дозволу не заводимо (виправдання в Global constraints).

- [ ] **Step 5:** застосувати, тест → PASS
- [ ] **Step 6: Commit** `feat(db): add school orders registry`

---

## Task 3: `Employee` — модель працівника без обов'язкового акаунта

**Files:**
- Modify: `packages/db/prisma/schema.prisma`, `apps/admin/src/lib/staff/update-staff-profile.ts`, `apps/admin/src/lib/staff/manage-awards.ts`, `apps/admin/src/app/(app)/users/[id]/staff-tab.tsx`, `apps/admin/src/app/(app)/users/[id]/user-profile-content.tsx`, `apps/admin/test/staff-profile.test.ts`
- Create: `packages/db/prisma/migrations/*_staff_profiles_to_employees/migration.sql`

**Interfaces:**
- Consumes: Task 1
- Produces: таблиця `employees` (перейменована з `staff_profiles`, розширена), функції `apps/admin/src/lib/staff/*` працюють з `employeeId`, а не тільки з `userId`

- [ ] **Step 1: Падаючий тест** — створення employee без `userId` (охоронець без акаунта), FK-и `position_code`/`status_order_id`, зміна `employment_status` пише `audit_logs`.
- [ ] **Step 2:** FAIL
- [ ] **Step 3: Схема**

```prisma
model Employee {
  id               String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId           String?              @unique @map("user_id") @db.Uuid
  firstName        String               @map("first_name")
  lastName         String               @map("last_name")
  middleName       String?              @map("middle_name")
  phone            String?
  email            String?
  positionCode     String?              @map("position_code")
  category         String?
  experienceYears  Int?                 @map("experience_years")
  employmentStatus EmploymentStatusKind @default(working) @map("employment_status")
  hiredOn          DateTime?            @map("hired_on") @db.Date
  dismissedOn      DateTime?            @map("dismissed_on") @db.Date
  statusOrderId    String?              @map("status_order_id") @db.Uuid
  deletedAt        DateTime?            @map("deleted_at") @db.Timestamptz
  createdAt        DateTime             @default(now()) @map("created_at") @db.Timestamptz
  updatedAt        DateTime             @updatedAt @map("updated_at") @db.Timestamptz

  position    StaffPosition? @relation(fields: [positionCode], references: [code])
  statusOrder SchoolOrder?   @relation(fields: [statusOrderId], references: [id])
  awards      StaffAward[]

  @@map("employees")
}
```

`userId` — плаский `String?` без Prisma `@relation` і без FK-констрейнта, за
тією ж конвенцією, що всі інші `*_user_id` на `app_users` у цій схемі
(`teacher_user_id`, `mentor_user_id`, `granted_by`...) — жоден з них не має
декларованого зв'язку, бо `app_users` навмисно не обростає десятками
back-relation масивів. `position_code`/`status_order_id` — реальні
домен-домен зв'язки, FK є.

`staff_awards.profile_id` перейменовується на `employee_id` (та сама
колонка, той самий FK, інша назва).

- [ ] **Step 4: Міграція**

```sql
alter table staff_profiles rename to employees;
alter table employees rename column profile_id_seq to employees_id_seq; -- якщо застосовно

alter table employees
  alter column user_id drop not null,
  add column first_name text,
  add column last_name text,
  add column middle_name text,
  add column email text,
  add column position_code text references staff_positions(code),
  add column employment_status employment_status_kind not null default 'working',
  add column hired_on date,
  add column dismissed_on date,
  add column status_order_id uuid references school_orders(id);

-- Backfill існуючих записів (усі мають user_id зараз) іменем з app_users,
-- щоб NOT NULL нижче не впав на наявних рядках.
update employees e
set first_name = split_part(u.full_name, ' ', 1),
    last_name = substr(u.full_name, length(split_part(u.full_name, ' ', 1)) + 2)
from app_users u
where u.id = e.user_id and e.first_name is null;

alter table employees
  alter column first_name set not null,
  alter column last_name set not null;

alter table staff_awards rename column profile_id to employee_id;

drop policy staff_profiles_read on employees; -- ім'я лишилось старим після rename
create policy employees_read on employees
  for select using (has_scope('staff.read', 'global') or user_id = current_app_user_id());

-- audit: зміна employment_status/position/status_order_id — кадрове рішення
create trigger employees_audit
  after insert or update or delete on employees
  for each row execute function trg_write_audit_log();
```

- [ ] **Step 5: Оновити `apps/admin/src/lib/staff/*`**

`update-staff-profile.ts` → приймає або `{ userId }`, або `{ employeeId }` як
ціль (створення employee без акаунта йде без `userId`), Zod-схема отримує
`firstName`/`lastName` обов'язковими, коли немає `userId`. `manage-awards.ts`
адаптувати на `employeeId` замість похідного від `userId`.

- [ ] **Step 6:** тести → PASS, потім `pnpm --filter @starland/admin test`, `pnpm typecheck`, `pnpm lint` — вивід показати перед комітом.
- [ ] **Step 7: Commit** `feat(db): rename staff_profiles to employees, decouple from app_users`

---

## Task 4: Статуси зарахування учня з підставою

**Files:**
- Modify: `packages/db/prisma/schema.prisma`, `apps/admin/src/lib/students/assign-class.ts`
- Create: `packages/db/prisma/migrations/*_enrollment_status_kind/migration.sql`, `apps/admin/src/lib/students/change-enrollment-status.ts`, `apps/admin/test/change-enrollment-status.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2
- Produces: `enrollments.status` → `enrollment_status_kind`, `enrollments.reason`, `enrollments.status_order_id`; функція `changeEnrollmentStatusWithPermissions` (вибуття/випуск/відрахування — усе, що НЕ є простим переведенням класу, яке вже робить `assign-class.ts`)

- [ ] **Step 1: Падаючий тест** — `withdrawStudent`/`graduateStudent` forbidden без `students.write`, закриває активне зарахування (`to_date`), пише статус + причину, `NotFoundError` якщо немає активного зарахування, аудит-запис.
- [ ] **Step 2:** FAIL
- [ ] **Step 3: Міграція**

```sql
alter table enrollments
  add column status_kind enrollment_status_kind not null default 'active',
  add column reason text,
  add column status_order_id uuid references school_orders(id);

update enrollments set status_kind = 'transferred_internal'::enrollment_status_kind
  where to_date is not null; -- історичні закриті записи — консервативне припущення "переведення", коригується вручну там, де відомо інше

alter table enrollments drop column status; -- старий вільний текст, ніде не читався
```

- [ ] **Step 4: Домен**

`change-enrollment-status.ts`: `requirePermission('students.write')`, Zod
`{status: 'withdrawn'|'graduated'|'expelled'|'academic_leave', reason: string.min(10), orderId: uuid.optional()}`,
закриває поточне активне зарахування (`to_date = now()`, `status_kind`,
`reason`, `status_order_id`) — на відміну від `assignClass` (Task з T1), яка
завжди залишає `status_kind: 'active'` на новому рядку, ця функція **не**
створює новий рядок зарахування — учень просто більше не має активного.

- [ ] **Step 5:** тести → PASS
- [ ] **Step 6: Commit** `feat(db): add enrollment status kinds with mandatory reason`

---

## Task 5: Сторінка «Персонал»

**Files:**
- Create: `apps/admin/src/app/(app)/staff/page.tsx`, `apps/admin/src/app/(app)/staff/staff-table.tsx`, `apps/admin/src/app/(app)/staff/columns.tsx`
- Modify: `apps/admin/src/components/layout/app-sidebar.tsx`, `packages/i18n/src/uk.ts`

**Interfaces:**
- Consumes: Task 3
- Produces: `/staff` — список `employees` (з `deletedAt: null`), а не `app_users`; ПІБ клікабельний → `/users/[id]` якщо є `userId`, інакше майбутній `/staff/[id]` (поза цим планом — картка employee без акаунта поки редагується тільки списком, повноцінний профіль-заглушка для employee без `userId` не входить у цей план, `TODO(question)`: чи потрібен окремий `/staff/[id]` зараз, чи почекає до першого реального безакаунтного співробітника)

- [ ] **Step 1:** `requireSession()` + `can('staff.read')`, `withUserContext`, `tx.employee.findMany({where: {deletedAt: null}, include: {position: true}})`
- [ ] **Step 2:** колонки — ПІБ (через `PersonLink`, якщо є `userId`, інакше простий текст — правило клікабельності з §6 стосується посилання на профіль, якого без акаунта ще нема), посада (`staff_positions.name`), статус зайнятості, телефон, дата прийняття
- [ ] **Step 3:** пункт меню «Персонал» у сайдбарі, за наявності `staff.read`
- [ ] **Step 4:** `pnpm --filter @starland/admin test`, typecheck, lint — вивід
- [ ] **Step 5: Commit** `feat(admin): add dedicated staff-only list page`

---

## Design-note (без коду цього циклу): відпустки/лікарняні і трекер для непедперсоналу

За вашим вибором — це фіксується зараз у плані, будується за розкладом T2/T4,
не в цьому циклі.

- **`staff_leave_requests`** (T2, разом із «заміни вчителів»):
  `employee_id, kind (vacation|sick_leave|unpaid_leave|maternity_leave),
  from_date, to_date, approved_by, status_order_id`. Джерело для двох речей:
  (1) `lessons.substitution_reason` у T2 отримує машинно читану причину замість
  вільного тексту, коли заміна викликана відпусткою/лікарняним; (2)
  `employees.employment_status` синхронізується тригером, коли настає
  `from_date` активної заявки — не вручну.
- **Розширення T4-трекера на непедперсонал:** зараз §4.12 спеки
  (`staff_presence_intervals`, `lesson_conduct_records`,
  `work_period_summaries`) рахує академічні години з проведених уроків — це
  покриває вчителів. Охорона/кухня/техперсонал не проводять уроків, тому для
  них `work_period_summaries` рахується **тільки** з `staff_presence_intervals`
  (інтервали сканування вхід/вихід), без `lesson_conduct_records`. Це не нова
  таблиця — уточнення функції підрахунку в T4, яке варто записати в спеку
  §4.12 до того, як T4 почнеться, щоб не переробляти після факту.
- Обидва пункти **не блокують** T1/T2 — фіксуються тут, щоб схема статусів
  (`EmploymentStatusKind`) і `staff_positions.is_teaching` з Task 1/3 вже були
  сумісні з ними, коли дійде черга.

---

## Порядок виконання

Task 1 → 2 → 3 → 4 → 5 послідовно (кожен наступний читає таблиці попереднього).
Design-note — окремий абзац у `docs/roadmap.md` (розділ «Модулі»), без окремого
Task.
