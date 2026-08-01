# ADR 0002: shadcn/ui (Radix UI) як компонентний kit для apps/admin

**Статус:** Прийнято (2026-08-02)

## Контекст

`CLAUDE.md` розділ 1 фіксує стек Starland, але не називає жодного
компонентного UI-kit для `apps/admin` — досі там був голий Tailwind. Дизайн
admin shell (`docs/superpowers/specs/2026-08-02-admin-shell-design.md`)
вимагає sidebar з mobile-режимом, dropdown-меню, command palette (Cmd+K),
таблиці з фільтрами — писати це з нуля на голому Radix означало б
переізобрітати добре перевірений код.

## Рішення

Використовуємо код shadcn/ui — компоненти на Radix UI Primitives
(`@radix-ui/react-*`), що копіюються в `apps/admin/src/components/ui/*` як
звичайний код проєкту (не npm-пакет `shadcn`, немає рантайм-залежності від
CLI). Реальна залежність — самі Radix-пакети, `class-variance-authority`,
`clsx`, `tailwind-merge`, `lucide-react`, `cmdk`, `next-themes`.

Референс структури й стилю — [shadcn-admin](https://github.com/satnaing/shadcn-admin),
клонований локально в `reference-admin/` (у `.gitignore`, не частина
репозиторію). Копіюється лише те, що використовується; код адаптується під
Next.js App Router (Server Components замість `@tanstack/react-router`,
без `@tanstack/react-query` — дані вантажаються на сервері).

## Наслідки

- Нова залежність від Radix UI Primitives у `apps/admin/package.json`.
- Компоненти в `components/ui/*` — код проєкту: агенти можуть і повинні їх
  редагувати напряму (не "чужий пакет", а наш код).
- Будь-яке оновлення дизайну цих примітивів — вручну, без `npx shadcn add`
  (не використовуємо CLI, щоб не тягнути мережевий виклик у білд).
