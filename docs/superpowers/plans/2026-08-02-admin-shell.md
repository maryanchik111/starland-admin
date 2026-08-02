# Admin Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Замінити дефолтний Next.js-шаблон `apps/admin` на робочий admin shell: sidebar+topbar, light/dark тема на кольорах `starland.school`, command palette (Cmd+K) з пошуком учнів — усе на дозволах з `packages/domain`, без нового каркасу для `students/*` (той переноситься окремим планом).

**Architecture:** Кореневий `app/layout.tsx` лишається мінімальним (html/body + ThemeProvider), новий route group `app/(app)/layout.tsx` — захищений shell (sidebar/header/command menu), захист сторінок і далі на `middleware.ts`. UI-примітиви — скопійований і патчений код shadcn/ui (Radix-based) з `reference-admin/`, не npm-залежність-бібліотека компонентів.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Radix UI primitives, `class-variance-authority`, `clsx`/`tailwind-merge`, `lucide-react`, `cmdk`, `next-themes`, Zod, Vitest (node env, без jsdom — проєкт тестує тільки доменну логіку, не рендер компонентів, це вже усталений патерн в `apps/admin/test/`).

## Global Constraints

- `any` заборонено; валідація на межах — Zod (`CLAUDE.md` розділ 5).
- Бізнес-логіка не живе в React-компонентах і не живе в Server Action — виносити в чисту функцію поруч, як `apps/admin/src/lib/students/update-student.ts` (розділ 5).
- UI-тексти — тільки через `packages/i18n`, не хардкодом у JSX (розділ 5, 6).
- Немає дозволу → елемент **не рендериться**, а не рендериться-й-падає (розділ 6).
- Не додавати залежність без потреби, яку не можна закрити 20 рядками свого коду (розділ 7.6) — `next-themes` і Radix-примітиви виправдані (стандартна, невелика поверхня; альтернатива — переписати їх власноруч, що суперечить іншому правилу «не винаходити велосипед»).
- Вибір UI-kit (shadcn/ui на Radix) — архітектурне рішення, фіксується ADR перед додаванням залежностей (розділ 1).
- Перед заявою «готово» — типчек, лінт, тести з виводом (розділ 7.4).
- Файл більший за ~300 рядків — сигнал розділити (розділ 5) — стосується `sidebar-config.ts`/`nav-*`, тримати їх невеликими.

---

### Task 1: ADR — shadcn/ui (Radix UI) як компонентний kit для apps/admin

**Files:**
- Create: `docs/adr/0002-shadcn-ui-component-kit.md`

**Interfaces:**
- Consumes: нічого
- Produces: задокументоване рішення, на яке посилаються всі наступні задачі цього плану

- [ ] **Step 1: Написати ADR**

`docs/adr/0002-shadcn-ui-component-kit.md`:
```markdown
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
без `@tanstack/react-query` — дані вантажаться на сервері).

## Наслідки

- Нова залежність від Radix UI Primitives у `apps/admin/package.json`.
- Компоненти в `components/ui/*` — код проєкту: агенти можуть і повинні їх
  редагувати напряму (не "чужий пакет", а наш код).
- Будь-яке оновлення дизайну цих примітивів — вручну, без `npx shadcn add`
  (не використовуємо CLI, щоб не тягнути мережевий виклик у білд).
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0002-shadcn-ui-component-kit.md
git commit -m "docs(adr): adopt shadcn/ui component code as admin UI kit"
```

---

### Task 2: Залежності та базові UI-примітиви

**Files:**
- Modify: `apps/admin/package.json`
- Create: `apps/admin/src/lib/utils.ts`
- Create: `apps/admin/src/hooks/use-mobile.tsx`
- Create: `apps/admin/src/components/ui/button.tsx`, `input.tsx`, `separator.tsx`,
  `skeleton.tsx`, `avatar.tsx`, `badge.tsx`, `table.tsx`, `tooltip.tsx`,
  `sheet.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `command.tsx`, `sidebar.tsx`

**Interfaces:**
- Consumes: Task 1 (ADR)
- Produces: `cn()` з `@/lib/utils`, `useIsMobile()` з `@/hooks/use-mobile`,
  усі перелічені компоненти з `@/components/ui/*` — саме ці імпорти
  використовують Task 3–6

- [ ] **Step 1: Додати залежності**

```bash
pnpm --filter @starland/admin add \
  @radix-ui/react-slot @radix-ui/react-separator @radix-ui/react-avatar \
  @radix-ui/react-tooltip @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
  class-variance-authority clsx tailwind-merge lucide-react cmdk next-themes
```

- [ ] **Step 2: Скопіювати `lib/utils.ts` і хук `use-mobile`**

```bash
cp reference-admin/src/lib/utils.ts apps/admin/src/lib/utils.ts
cp reference-admin/src/hooks/use-mobile.tsx apps/admin/src/hooks/use-mobile.tsx
```

Відкрити `apps/admin/src/lib/utils.ts` і **прибрати** функції
`getPageNumbers` і `getDisplayNameInitials` — вони для data-table/nav-user,
яких у цьому плані ще немає (YAGNI, `CLAUDE.md` розділ 6.5); лишити тільки
`cn()` і `sleep()`. Якщо `sleep()` теж ніде не використовується після цього
плану — прибрати й її.

- [ ] **Step 3: Скопіювати презентаційні примітиви (без hooks/context)**

```bash
cp reference-admin/src/components/ui/button.tsx apps/admin/src/components/ui/button.tsx
cp reference-admin/src/components/ui/input.tsx apps/admin/src/components/ui/input.tsx
cp reference-admin/src/components/ui/separator.tsx apps/admin/src/components/ui/separator.tsx
cp reference-admin/src/components/ui/skeleton.tsx apps/admin/src/components/ui/skeleton.tsx
cp reference-admin/src/components/ui/avatar.tsx apps/admin/src/components/ui/avatar.tsx
cp reference-admin/src/components/ui/badge.tsx apps/admin/src/components/ui/badge.tsx
cp reference-admin/src/components/ui/table.tsx apps/admin/src/components/ui/table.tsx
```

Ці файли не використовують React-хуки самі по собі (тільки `React.forwardRef`-
подібний рендер пропсів), тому директива `'use client'` їм не потрібна — вони
можуть рендеритись і з Server Component.

- [ ] **Step 4: Скопіювати інтерактивні примітиви й додати `'use client'`**

```bash
cp reference-admin/src/components/ui/tooltip.tsx apps/admin/src/components/ui/tooltip.tsx
cp reference-admin/src/components/ui/dialog.tsx apps/admin/src/components/ui/dialog.tsx
cp reference-admin/src/components/ui/sheet.tsx apps/admin/src/components/ui/sheet.tsx
cp reference-admin/src/components/ui/dropdown-menu.tsx apps/admin/src/components/ui/dropdown-menu.tsx
cp reference-admin/src/components/ui/command.tsx apps/admin/src/components/ui/command.tsx
cp reference-admin/src/components/ui/sidebar.tsx apps/admin/src/components/ui/sidebar.tsx
```

`tooltip.tsx` і `dialog.tsx` уже мають `'use client'` першим рядком —
лишити як є. У **`sheet.tsx`**, **`dropdown-menu.tsx`**, **`command.tsx`**,
**`sidebar.tsx`** додати рядок `'use client'` (і порожній рядок після)
перед першим `import` — ці файли використовують React-контекст/стан
(`sidebar.tsx`: `useContext`, `useState`, `useEffect`; інші — інтерактивні
Radix-примітиви з локальним станом відкриття).

- [ ] **Step 5: Перевірити типи**

Run: `pnpm --filter @starland/admin typecheck`
Expected: PASS без помилок (якщо є — найімовірніше відсутній `@/*` alias
чи забутий `'use client'`; alias уже є в `apps/admin/tsconfig.json`).

- [ ] **Step 6: Commit**

```bash
git add apps/admin/package.json apps/admin/src/lib/utils.ts apps/admin/src/hooks/use-mobile.tsx apps/admin/src/components/ui
git commit -m "feat(admin): add shadcn/ui base primitives (button, sidebar, command, dialog, etc.)"
```

---

### Task 3: Тема (light/dark) на кольорах starland.school

**Files:**
- Modify: `apps/admin/src/app/globals.css`
- Create: `apps/admin/src/components/theme-provider.tsx`, `apps/admin/src/components/theme-toggle.tsx`
- Modify: `apps/admin/src/app/layout.tsx`
- Test: `apps/admin/test/theme-toggle.test.ts`

**Interfaces:**
- Consumes: Task 2 (`Button`, `DropdownMenu*`)
- Produces: CSS-змінні `--primary`, `--accent`, `--destructive` тощо (light/dark),
  `<ThemeProvider>` (обгортка над `next-themes`), `<ThemeToggle>`,
  чиста функція `nextThemeInCycle(current)` — використовується в `ThemeToggle`

- [ ] **Step 1: Написати падаючий тест на цикл теми**

`apps/admin/test/theme-toggle.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { nextThemeInCycle } from '../src/components/theme-toggle.js'

describe('nextThemeInCycle', () => {
  it('cycles light -> dark -> system -> light', () => {
    expect(nextThemeInCycle('light')).toBe('dark')
    expect(nextThemeInCycle('dark')).toBe('system')
    expect(nextThemeInCycle('system')).toBe('light')
  })

  it('treats an unknown value as system', () => {
    expect(nextThemeInCycle(undefined)).toBe('dark')
  })
})
```

- [ ] **Step 2: Запустити й переконатися, що падає**

Run: `pnpm --filter @starland/admin test theme-toggle`
Expected: FAIL — модуль `theme-toggle.tsx` не існує.

- [ ] **Step 3: Оновити CSS-токени**

У `apps/admin/src/app/globals.css` замінити вміст на:
```css
@import "tailwindcss";

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

@theme inline {
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans), Arial, Helvetica, sans-serif;
}
```

Прибрано попередній `@media (prefers-color-scheme: dark)` блок — тепер
темою керує клас `.dark` на `<html>` (через `next-themes`), а не
медіа-запит, інакше вони конфліктують.

- [ ] **Step 4: Реалізувати провайдер теми**

`apps/admin/src/components/theme-provider.tsx`:
```tsx
'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

- [ ] **Step 5: Реалізувати перемикач теми**

`apps/admin/src/components/theme-toggle.tsx`:
```tsx
'use client'

import { Moon, Sun, MonitorCog } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

type ThemeName = 'light' | 'dark' | 'system'

/** Чиста функція циклу — саме її покриває тест, без залежності від next-themes. */
export function nextThemeInCycle(current: string | undefined): ThemeName {
  if (current === 'light') return 'dark'
  if (current === 'dark') return 'system'
  return current === 'system' ? 'light' : 'dark'
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const icon =
    theme === 'light' ? <Sun /> : theme === 'dark' ? <Moon /> : <MonitorCog />

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Перемкнути тему"
      onClick={() => setTheme(nextThemeInCycle(theme))}
    >
      {icon}
    </Button>
  )
}
```

- [ ] **Step 6: Підключити провайдер у кореневий layout**

Модифікувати `apps/admin/src/app/layout.tsx` — додати `suppressHydrationWarning`
на `<html>` (обов'язково для `next-themes`, інакше SSR/CSR розбіжність класу
`.dark` кидає варнінг) і обгорнути `children` у `ThemeProvider`:
```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Starland",
  description: "Адмінка школи Starland",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="uk"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Запустити тести**

Run: `pnpm --filter @starland/admin test theme-toggle`
Expected: PASS, два тести.

- [ ] **Step 8: Ручна перевірка в браузері**

Переконатись, що дев-сервер адмінки запущений (`pnpm --filter admin dev`),
відкрити `http://localhost:3000`, натиснути перемикач теми (поки що ніде не
розміщений — тимчасово додати `<ThemeToggle />` у `app/page.tsx` для
перевірки, прибрати цей тимчасовий рядок перед комітом, бо постійне місце
для нього — `Header` у Task 5) і переконатись, що фон/текст перемикаються
між світлою й темною палітрою без стрибка при перезавантаженні сторінки.

- [ ] **Step 9: Commit**

```bash
git add apps/admin/src/app/globals.css apps/admin/src/app/layout.tsx apps/admin/src/components/theme-provider.tsx apps/admin/src/components/theme-toggle.tsx apps/admin/test/theme-toggle.test.ts
git commit -m "feat(admin): add light/dark theme with starland.school color tokens"
```

---

### Task 4: Навігація sidebar за дозволами

**Files:**
- Create: `apps/admin/src/components/layout/nav-config.ts`
- Create: `apps/admin/src/components/layout/visible-nav-items.ts`
- Create: `apps/admin/src/components/layout/app-sidebar.tsx`
- Test: `apps/admin/test/visible-nav-items.test.ts`

**Interfaces:**
- Consumes: Task 2 (`Sidebar*` з `@/components/ui/sidebar`), `EffectivePermissions`
  з `@starland/domain` (метод `.can(code)`)
- Produces: `NAV_ITEMS: NavItem[]`, `visibleNavItems(permissions): NavItem[]`,
  `<AppSidebar session={session} />` — використовується в Task 7

- [ ] **Step 1: Написати падаючий тест на фільтрацію пунктів меню**

`apps/admin/test/visible-nav-items.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { EffectivePermissions } from '@starland/domain'
import { visibleNavItems } from '../src/components/layout/visible-nav-items.js'

describe('visibleNavItems', () => {
  it('hides items whose required permission is missing', () => {
    const permissions = new EffectivePermissions([])
    const items = visibleNavItems(permissions)
    expect(items.some((i) => i.url === '/students')).toBe(false)
  })

  it('shows an item once its required permission is granted', () => {
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.read', scopeType: 'global', scopeId: null },
    ])
    const items = visibleNavItems(permissions)
    expect(items.map((i) => i.url)).toContain('/students')
  })

  it('shows items with no permission requirement to everyone', () => {
    const permissions = new EffectivePermissions([])
    const items = visibleNavItems(permissions)
    expect(items.some((i) => i.url === '/')).toBe(true)
  })
})
```

- [ ] **Step 2: Запустити й переконатися, що падає**

Run: `pnpm --filter @starland/admin test visible-nav-items`
Expected: FAIL — модуль `visible-nav-items.ts` не існує.

- [ ] **Step 3: Описати статичну конфігурацію навігації**

`apps/admin/src/components/layout/nav-config.ts`:
```ts
import type { LucideIcon } from 'lucide-react'
import { LayoutDashboard, Users } from 'lucide-react'

export interface NavItem {
  title: string
  url: string
  icon: LucideIcon
  /** null — пункт видно всім автентифікованим користувачам (напр. дашборд). */
  permissionCode: string | null
}

export const NAV_ITEMS: readonly NavItem[] = [
  { title: 'Дашборд', url: '/', icon: LayoutDashboard, permissionCode: null },
  { title: 'Учні', url: '/students', icon: Users, permissionCode: 'students.read' },
] as const
```

Пункти «Класи», «Оцінки», «Чати», «Персонал», «Налаштування» **не додаються
зараз** — відповідних сторінок ще немає (Task 6, 8, 9, 11, 14 у
`docs/plans/2026-07-31-t1-foundation.md`), а пункт меню без сторінки —
мертве посилання (YAGNI, `CLAUDE.md` розділ 6.5). Додаються в
`NAV_ITEMS` тим самим планом, що додає відповідну сторінку.

- [ ] **Step 4: Реалізувати фільтрацію за дозволами**

`apps/admin/src/components/layout/visible-nav-items.ts`:
```ts
import type { EffectivePermissions } from '@starland/domain'
import { NAV_ITEMS, type NavItem } from './nav-config.js'

export function visibleNavItems(permissions: EffectivePermissions): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => item.permissionCode === null || permissions.can(item.permissionCode),
  )
}
```

- [ ] **Step 5: Запустити тести**

Run: `pnpm --filter @starland/admin test visible-nav-items`
Expected: PASS, три тести.

- [ ] **Step 6: Реалізувати `AppSidebar`**

`apps/admin/src/components/layout/app-sidebar.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { uk } from '@starland/i18n'
import type { EffectivePermissions } from '@starland/domain'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { visibleNavItems } from './visible-nav-items.js'

export function AppSidebar({ permissions }: { permissions: EffectivePermissions }) {
  const pathname = usePathname()
  const items = visibleNavItems(permissions)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <span className="px-2 py-1 text-sm font-semibold">Starland</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{uk.common.navSections}</SidebarGroupLabel>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
                  <Link href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
```

Без `nav-group.tsx`/collapsible-підменю з референсу — у нас поки лише
пласкі пункти (`NAV_ITEMS` без вкладеності), піделементи додамо, коли
з'явиться реальна вкладена навігація (YAGNI).

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/components/layout apps/admin/test/visible-nav-items.test.ts
git commit -m "feat(admin): add permission-filtered sidebar navigation"
```

---

### Task 5: Topbar (Header) з user-меню

**Files:**
- Create: `apps/admin/src/components/layout/header.tsx`
- Create: `apps/admin/src/components/layout/user-menu.tsx`
- Create: `apps/admin/src/app/(app)/sign-out/actions.ts`

**Interfaces:**
- Consumes: Task 2 (`Separator`, `DropdownMenu*`, `Avatar*`), Task 3 (`ThemeToggle`),
  Task 4 (`SidebarTrigger` з `@/components/ui/sidebar`), `Session` з `@/lib/session`
- Produces: `<Header session={session} />` — використовується в Task 7

- [ ] **Step 1: Server Action виходу**

`apps/admin/src/app/(app)/sign-out/actions.ts`:
```ts
'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export async function signOut(): Promise<void> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) =>
          list.forEach((c) => cookieStore.set(c.name, c.value, c.options)),
      },
    },
  )
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 2: User-меню**

`apps/admin/src/components/layout/user-menu.tsx`:
```tsx
'use client'

import { LogOut } from 'lucide-react'
import { uk } from '@starland/i18n'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOut } from '@/app/(app)/sign-out/actions.js'

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0]?.[0] ?? '' ) + (parts[parts.length - 1]?.[0] ?? '')
}

export function UserMenu({ fullName }: { fullName: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label={uk.common.userMenuLabel} className="rounded-full">
          <Avatar>
            <AvatarFallback>{initials(fullName).toUpperCase()}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{fullName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut />
          <span>{uk.common.signOut}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 3: Header**

`apps/admin/src/components/layout/header.tsx`:
```tsx
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/theme-toggle'
import { UserMenu } from './user-menu.js'

export function Header({ fullName }: { fullName: string }) {
  return (
    <header className="flex h-16 items-center gap-3 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <div className="flex-1" />
      <ThemeToggle />
      <UserMenu fullName={fullName} />
    </header>
  )
}
```

- [ ] **Step 4: Перевірити типи**

Run: `pnpm --filter @starland/admin typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/layout/header.tsx apps/admin/src/components/layout/user-menu.tsx "apps/admin/src/app/(app)/sign-out"
git commit -m "feat(admin): add header with theme toggle and user menu"
```

---

### Task 6: Command palette (Cmd+K) з пошуком учнів

**Files:**
- Create: `apps/admin/src/lib/search-people.ts`
- Create: `apps/admin/src/app/(app)/command-menu-actions.ts`
- Create: `apps/admin/src/components/layout/command-menu.tsx`
- Test: `apps/admin/test/search-people.test.ts`

**Interfaces:**
- Consumes: Task 2 (`Command*` з `@/components/ui/command`), Task 4 (`NAV_ITEMS`),
  `EffectivePermissions`, `withUserContext` з `@starland/db`
- Produces: `searchPeopleWithPermissions(...)`, Server Action `searchPeople(query)`,
  `<CommandMenu items={NAV_ITEMS} />` — монтується в Task 7

- [ ] **Step 1: Написати падаючий тест на доменну логіку пошуку**

`apps/admin/test/search-people.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { ForbiddenError, EffectivePermissions } from '@starland/domain'
import { searchPeopleWithPermissions } from '../src/lib/search-people.js'

describe('searchPeopleWithPermissions', () => {
  it('refuses when the caller has no students.read permission at all', async () => {
    const permissions = new EffectivePermissions([])
    const findMany = vi.fn()
    await expect(
      searchPeopleWithPermissions(permissions, { findMany } as never, 'кова'),
    ).rejects.toThrow(ForbiddenError)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('rejects a query shorter than 2 characters instead of hitting the database', async () => {
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.read', scopeType: 'global', scopeId: null },
    ])
    const findMany = vi.fn()
    await expect(
      searchPeopleWithPermissions(permissions, { findMany } as never, 'к'),
    ).rejects.toThrow(/query/)
    expect(findMany).not.toHaveBeenCalled()
  })

  it('passes a valid query through to the database client', async () => {
    const permissions = new EffectivePermissions([
      { permissionCode: 'students.read', scopeType: 'global', scopeId: null },
    ])
    const findMany = vi.fn().mockResolvedValue([
      { id: 's1', firstName: 'Олена', lastName: 'Коваль' },
    ])
    const result = await searchPeopleWithPermissions(permissions, { findMany } as never, 'ковал')
    expect(findMany).toHaveBeenCalledOnce()
    expect(result).toEqual([{ id: 's1', name: 'Коваль Олена' }])
  })
})
```

- [ ] **Step 2: Запустити й переконатися, що падає**

Run: `pnpm --filter @starland/admin test search-people`
Expected: FAIL — модуль `search-people.ts` не існує.

- [ ] **Step 3: Реалізувати доменну функцію пошуку**

`apps/admin/src/lib/search-people.ts`:
```ts
import { z } from 'zod'
import { requirePermission, type EffectivePermissions } from '@starland/domain'

const Query = z.string().trim().min(2, 'query must be at least 2 characters')

export interface StudentSearchClient {
  findMany(args: {
    where: {
      OR: Array<
        | { firstName: { contains: string; mode: 'insensitive' } }
        | { lastName: { contains: string; mode: 'insensitive' } }
      >
    }
    take: number
  }): Promise<Array<{ id: string; firstName: string; lastName: string }>>
}

export interface PersonResult {
  id: string
  name: string
}

/** Чиста логіка без Next.js — саме її покривають тести. */
export async function searchPeopleWithPermissions(
  permissions: EffectivePermissions,
  studentClient: StudentSearchClient,
  rawQuery: string,
): Promise<PersonResult[]> {
  requirePermission(permissions, 'students.read')
  const query = Query.parse(rawQuery)

  const students = await studentClient.findMany({
    where: {
      OR: [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: 10,
  })

  return students.map((s) => ({ id: s.id, name: `${s.lastName} ${s.firstName}` }))
}
```

`requirePermission` тут навмисно без `scope` — перевіряє лише наявність
`students.read` у принципі (глобальний чи будь-який скоуп). Обмеження на
конкретні класи для не-глобальних ролей (`own_teaching`, `mentor_classes`)
лишається на RLS через `withUserContext` у Server Action нижче — так само,
як у `students/page.tsx`, доменна функція тут не дублює RLS-скоуп, а
покладається на нього для фактичного відсікання рядків.

- [ ] **Step 4: Запустити тести**

Run: `pnpm --filter @starland/admin test search-people`
Expected: PASS, три тести.

- [ ] **Step 5: Server Action**

`apps/admin/src/app/(app)/command-menu-actions.ts`:
```ts
'use server'

import { withUserContext } from '@starland/db'
import { requireSession } from '@/lib/session'
import { searchPeopleWithPermissions, type PersonResult } from '@/lib/search-people.js'

export async function searchPeople(query: string): Promise<PersonResult[]> {
  const session = await requireSession()
  return withUserContext(session.authUserId, (tx) =>
    searchPeopleWithPermissions(session.permissions, tx.student, query),
  )
}
```

- [ ] **Step 6: Компонент command palette**

`apps/admin/src/components/layout/command-menu.tsx`:
```tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { uk } from '@starland/i18n'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { searchPeople } from '@/app/(app)/command-menu-actions.js'
import { NAV_ITEMS, type NavItem } from './nav-config.js'
import type { PersonResult } from '@/lib/search-people.js'

export function CommandMenu({ items }: { items: readonly NavItem[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<PersonResult[]>([])
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (query.trim().length < 2) {
      setPeople([])
      return
    }
    startTransition(async () => {
      setPeople(await searchPeople(query))
    })
  }, [query])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder={uk.common.commandPlaceholder}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{isPending ? uk.common.searching : uk.common.empty}</CommandEmpty>
        <CommandGroup heading={uk.common.navSections}>
          {items.map((item) => (
            <CommandItem
              key={item.url}
              value={item.title}
              onSelect={() => {
                setOpen(false)
                router.push(item.url)
              }}
            >
              <item.icon />
              <span>{item.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        {people.length > 0 && (
          <CommandGroup heading={uk.students.title}>
            {people.map((person) => (
              <CommandItem
                key={person.id}
                value={person.name}
                onSelect={() => {
                  setOpen(false)
                  router.push(`/students/${person.id}`)
                }}
              >
                <span>{person.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
```

Пункти меню в командній палітрі — усі статичні `items`, без фільтра за
дозволами тут: `CommandMenu` монтується в Task 7 з уже відфільтрованим
`visibleNavItems(session.permissions)`, тому дублювати перевірку не треба.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/lib/search-people.ts "apps/admin/src/app/(app)/command-menu-actions.ts" apps/admin/src/components/layout/command-menu.tsx apps/admin/test/search-people.test.ts
git commit -m "feat(admin): add Cmd+K command palette with permission-scoped student search"
```

---

### Task 7: Захищений shell — вʼязати все в `(app)` route group

**Files:**
- Create: `apps/admin/src/app/(app)/layout.tsx`
- Move: `apps/admin/src/app/page.tsx` → `apps/admin/src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: Task 4 (`AppSidebar`), Task 5 (`Header`), Task 6 (`CommandMenu`, `NAV_ITEMS`),
  `requireSession` з `@/lib/session`
- Produces: робочий захищений shell на всіх сторінках під `(app)` (URL не
  змінюється — route group не впливає на шлях)

- [ ] **Step 1: Перенести дашборд-сторінку**

```bash
mkdir -p "apps/admin/src/app/(app)"
git mv apps/admin/src/app/page.tsx "apps/admin/src/app/(app)/page.tsx"
```

Замінити вміст `apps/admin/src/app/(app)/page.tsx` на мінімальний плейсхолдер
(попередній вміст — маркетинговий шаблон `create-next-app`, більше не
актуальний):
```tsx
export default function DashboardPage() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Starland</h1>
    </main>
  )
}
```

- [ ] **Step 2: Layout захищеного shell**

`apps/admin/src/app/(app)/layout.tsx`:
```tsx
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar.js'
import { Header } from '@/components/layout/header.js'
import { CommandMenu } from '@/components/layout/command-menu.js'
import { NAV_ITEMS } from '@/components/layout/nav-config.js'
import { visibleNavItems } from '@/components/layout/visible-nav-items.js'
import { requireSession } from '@/lib/session'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  const items = visibleNavItems(session.permissions)

  return (
    <SidebarProvider>
      <AppSidebar permissions={session.permissions} />
      <SidebarInset>
        <Header fullName={session.fullName} />
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
      <CommandMenu items={items.length > 0 ? items : NAV_ITEMS} />
    </SidebarProvider>
  )
}
```

`requireSession()` тут — той самий виклик, що вже робить кожна сторінка
(`students/page.tsx`) окремо; він лишається і на сторінках теж (Next.js не
дедуплікує через layout автоматично для авторизаційних перевірок нижчого
рівня), але тепер shell гарантовано не рендериться для неавтентифікованого
користувача ще до дочірньої сторінки.

- [ ] **Step 3: Прибрати тимчасовий `<ThemeToggle />` з Task 3**

Якщо в Task 3, Step 8 `<ThemeToggle />` було тимчасово додано в
`app/page.tsx` для ручної перевірки — переконатися, що після переносу файлу
в Task 7 Step 1 його там більше немає (він живе в `Header` з Task 5).

- [ ] **Step 4: Перевірити типи, лінт, тести**

Run: `pnpm --filter @starland/admin typecheck && pnpm --filter @starland/admin lint && pnpm --filter @starland/admin test`
Expected: усе PASS.

- [ ] **Step 5: Ручна перевірка в браузері**

`pnpm --filter admin dev`, відкрити `http://localhost:3000` (потрібен
залогінений сеанс — див. Task 13 з основного плану щодо створення
тестового користувача):
- sidebar видно, пункт «Учні» видно лише якщо в користувача є `students.read`;
- `Cmd+K`/`Ctrl+K` відкриває command palette, пошук за 2+ символами показує
  учнів зі скоупу користувача;
- перемикач теми в Header працює і зберігається між перезавантаженнями;
- на вузькому вікні sidebar згортається в `Sheet` (мобільний режим).

- [ ] **Step 6: Commit**

```bash
git add "apps/admin/src/app/(app)"
git commit -m "feat(admin): wire sidebar, header and command palette into protected app shell"
```

---

## Явно поза цим планом

- Перенесення `students/*` під `(app)` route group і переписування таблиці
  списку учнів на `data-table`-компоненти — окремий наступний план (Task 14
  міграція), як домовлено з користувачем.
- `data-table` компоненти (`column-header`, `toolbar`, `faceted-filter`,
  `pagination`) з `reference-admin/` — копіюються в тому наступному плані,
  де з'являється перший реальний споживач; копіювати їх зараз без жодного
  використання порушило б YAGNI.
- Playwright E2E (відкрити Cmd+K, перемкнути тему) — Playwright ще не
  налаштований у репозиторії (з'являється в Task 16 основного плану T1);
  до того часу перевірка цього shell — ручна (Task 7, Step 5).
- Пункти навігації «Класи», «Оцінки», «Чати», «Персонал», «Налаштування» —
  додаються в `NAV_ITEMS` разом із відповідними сторінками в наступних Task
  основного плану T1.
