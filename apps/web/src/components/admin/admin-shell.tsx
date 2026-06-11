'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';

/**
 * Admin chrome. The Puck editor (/admin/edit/*) is a focused full-screen
 * surface — it drops the sidebar and the centered container so Puck gets the
 * full viewport. Every other admin route gets sidebar + a contained main.
 */
export function AdminShell({
  locale,
  theme,
  email,
  roles,
  children,
}: {
  locale: string;
  theme: 'light' | 'dark';
  email: string;
  roles: string[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isEditor = pathname.startsWith('/admin/edit');

  if (isEditor) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  return (
    <div className="flex">
      <Sidebar locale={locale} theme={theme} email={email} roles={roles} />
      <main className="min-h-screen flex-1 overflow-auto bg-background">
        <div className="mx-auto max-w-5xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
