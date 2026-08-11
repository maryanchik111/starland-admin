# Admin Shell — дизайн

**Дата:** 2026-08-02
**Статус:** Затверджено, очікує написання плану реалізації.

## Контекст і мета

`apps/admin` зараз — голий Next.js-шаблон (`create-next-app`) з уже реалізованими
`/login` (Task 13) і `students/*` (частина Task 14), але без спільного layout:
немає sidebar, topbar, теми, command palette. Мета — побудувати каркас адмінки
(«admin shell»), у стилі референсу [shadcn-admin](https://github.com/satnaing/shadcn-admin)
(клоновано в `reference-admin/`, у git ігнорується), адаптований під наш стек
(Next.js App Router + Server Actions, без Vite/react-router/react-query) і
доменну модель зі `docs/specs/2026-07-31-starland-design.md`.

## Архітектура

`apps/admin/src/app/layout.tsx` перестає бути дефолтним Next.js-шаблоном і стає
кореневим shell для всіх захищених сторінок:

```
<html>
  <body>
    <ThemeProvider>            {/* next-themes, light/dark, клас .dark на <html> */}
      <SidebarProvider>
        <AppSidebar />          {/* навігація за розділами домену, фільтр за дозволами */}
        <div>
          <Header />            {/* хлібні крихти, theme toggle, user menu, Cmd+K trigger */}
          <main>{children}</main>
        </div>
        <CommandMenu />         {/* модалка Cmd+K, портал поза основним деревом */}
      </SidebarProvider>
    </ThemeProvider>
  </body>
</html>
```

Захист сторінок лишається на `middleware.ts` (уже реалізований у Task 13) —
окремого `_authenticated` route-group, як у reference, не потрібно: `/login`
винесений з-під middleware, все інше — під ним.

## Компоненти (з reference-admin, копія коду — не npm-залежність shadcn)

Переноситься мінімальний набір, потрібний для layout + таблиць + command palette:

- **`components/ui/`**: `button`, `input`, `sidebar`, `sheet`, `dropdown-menu`,
  `table`, `command`, `dialog`, `avatar`, `badge`, `separator`, `select`.
  Це стандартний код shadcn/ui на Radix UI — копіюється в
  `apps/admin/src/components/ui/*`, Radix стає реальною залежністю
  (`package.json`), задокументованою в ADR.
- **`components/layout/`**: `app-sidebar.tsx`, `header.tsx`, `nav-group.tsx` —
  адаптуються під нашу навігацію. `team-switcher.tsx` **не переноситься** —
  школа одна (`single-tenant`, без `school_id` у схемі), перемикач команд не
  має сенсу.
- **`components/data-table/`**: `column-header`, `toolbar`, `faceted-filter`,
  `pagination` — переносяться майже 1:1 (`@tanstack/react-table`, легка
  бібліотека без вбудованого роутера чи query-шару). Фільтри й пагінація
  читають/пишуть у `searchParams`, а не у внутрішній React-стан — сторінка
  лишається Server Component, дані вантажаться на сервері.
- **`command-menu.tsx`** — спрощується: статичні пункти навігації (за
  дозволами) + Server Action `searchPeople(query)` для пошуку людей
  (учні/персонал). Відкриття по `Cmd+K` / `Ctrl+K`.

## Data fetching

**Без `@tanstack/react-query`.** Referens використовує react-query, бо це
Vite-SPA без сервера. У нас Next.js App Router: списки й фільтри — Server
Components, що читають `searchParams` і викликають доменний шар напряму;
мутації — Server Actions (уже є патерн у `students/actions.ts`). Причина:
`CLAUDE.md` розділ 6 — не додавати залежність, яку можна закрити без неї;
react-query тут дублював би стан, який і так живе на сервері.

## Тема (light/dark)

`next-themes` — клас `.dark` на `<html>`, перемикач у `Header`. CSS-змінні
визначаються в `globals.css` як semantic tokens, значення — з палітри сайту
`starland.school` (`css/style.css`):

```css
:root {
  --primary: #7165CF;
  --primary-hover: #988DEF;
  --primary-foreground: #ffffff;
  --secondary: #3C3577;
  --accent: #EED850;
  --accent-foreground: #3C3577;
  --destructive: #ff5268;
  --background: #ffffff;
  --foreground: #222222;
  --muted: #f4f4f4;
  --muted-foreground: #444444;
  --border: #d7d7d7;
}

.dark {
  --primary: #988DEF;
  --primary-hover: #7165CF;
  --primary-foreground: #17142b;
  --secondary: #CED9FB;
  --accent: #EEC450;
  --accent-foreground: #17142b;
  --destructive: #FF7B8C;
  --background: #17142b;
  --foreground: #f2f4f6;
  --muted: #221f3d;
  --muted-foreground: #a3a0c2;
  --border: #322d55;
}
```

`--primary` — активний стан sidebar, кнопки, топбар. `--accent` (жовтий) —
бейджі й попередження (наприклад «оцінку востаннє змінив не автор», «вікно
редагування 48 год спливає»; вимога прозорості з розділу 3 `CLAUDE.md`).
`--destructive` — деструктивні дії й помилки форм.

## Доменна прив'язка

Пункти sidebar і видимість елементів UI визначаються дозволами користувача
через `packages/domain` (проєкція `user_effective_scopes`, уже частково
використовується в `session.ts`). Немає дозволу → пункт **не рендериться**
(розділ 6 `CLAUDE.md`), а не рендериться з подальшим падінням на сервері.

## Task 14 (students) — інтеграція

Спершу будується shell (цей спек), окремим кроком плану — перенесення
існуючих `students/page.tsx` і `students/[id]/page.tsx` під новий layout і
переписування таблиці списку учнів на `data-table`-компоненти замість
поточної реалізації.

## Тестування

- Unit: `nav-group` — чиста функція фільтрації пунктів меню за списком
  дозволів, винесена окремо від рендеру (легко тестувати без React).
- Unit: `searchPeople` Server Action — Zod-валідація вхідного запиту,
  перевірка, що результат обмежений скоупом користувача (не глобальний
  для ролей без `global`-скоупу).
- Playwright (happy path): відкрити Cmd+K → ввести запит → побачити
  результат; перемкнути тему light/dark і перевірити збереження вибору
  між перезавантаженнями сторінки.

## Явно поза скоупом цього спека

- Самі сторінки `Класи`, `Оцінки`, `Чати` — тільки пункти навігації-заглушки
  в sidebar, вести можуть на `/coming-soon` чи бути прихованими, поки немає
  відповідних Task у плані T1/T2.
- Мобільна адаптивність — `sidebar` з reference-admin вже має вбудований
  `sheet`-режим для вузьких екранів, окремого дизайну не потрібно.
