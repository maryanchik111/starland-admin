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
