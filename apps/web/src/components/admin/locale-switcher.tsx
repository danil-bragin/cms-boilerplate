'use client';

import { useTransition } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function LocaleSwitcher({ current }: { current: string }) {
  const [, start] = useTransition();
  return (
    <Select
      value={current}
      onValueChange={(value) =>
        start(() => {
          document.cookie = `admin_locale=${value}; path=/; max-age=31536000`;
          window.location.reload();
        })
      }
    >
      <SelectTrigger className="h-8 w-[72px]" aria-label="Language">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">EN</SelectItem>
        <SelectItem value="ru">RU</SelectItem>
      </SelectContent>
    </Select>
  );
}
