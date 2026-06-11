'use client';

import { useTransition } from 'react';

export function LocaleSwitcher({ current }: { current: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      value={current}
      disabled={pending}
      onChange={(e) =>
        start(() => {
          document.cookie = `admin_locale=${e.target.value}; path=/; max-age=31536000`;
          window.location.reload();
        })
      }
      style={{ padding: 2, fontSize: 13 }}
      aria-label="Language"
    >
      <option value="en">EN</option>
      <option value="ru">RU</option>
    </select>
  );
}
