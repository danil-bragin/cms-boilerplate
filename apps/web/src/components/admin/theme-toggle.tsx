'use client';
import { Moon, Sun } from 'lucide-react';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';

export function ThemeToggle({ theme }: { theme: 'light' | 'dark' }) {
  const [, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() =>
        start(() => {
          const next = theme === 'dark' ? 'light' : 'dark';
          document.cookie = `admin_theme=${next}; path=/; max-age=31536000`;
          document.documentElement.classList.toggle('dark', next === 'dark');
          window.location.reload();
        })
      }
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
