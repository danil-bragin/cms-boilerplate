import './admin.css';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { getSession } from '@/lib/session';
import { AdminShell } from '@/components/admin/admin-shell';
import { Toaster } from '@/components/ui/sonner';

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession({ refresh: true });
  if (!session) redirect('/api/auth/login?returnTo=/admin');

  const messages = await getMessages();
  const cookieStore = await cookies();
  const locale = cookieStore.get('admin_locale')?.value ?? 'en';
  const theme = (cookieStore.get('admin_theme')?.value === 'dark' ? 'dark' : 'light') as 'light' | 'dark';

  return (
    <html lang={locale} className={theme === 'dark' ? 'dark' : undefined}>
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
          <AdminShell locale={locale} theme={theme} email={session.email} roles={session.roles}>
            {children}
          </AdminShell>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
