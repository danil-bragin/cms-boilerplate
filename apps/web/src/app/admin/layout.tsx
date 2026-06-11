import './admin.css';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/session';
import { LocaleSwitcher } from '@/components/admin/locale-switcher';

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession({ refresh: true });
  if (!session) redirect('/api/auth/login?returnTo=/admin');

  const messages = await getMessages();
  const t = await getTranslations('nav');
  const cookieStore = await cookies();
  const locale = cookieStore.get('admin_locale')?.value ?? 'en';
  const theme = (cookieStore.get('admin_theme')?.value === 'dark' ? 'dark' : 'light') as 'light' | 'dark';

  return (
    <html lang={locale} className={theme === 'dark' ? 'dark' : undefined}>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <NextIntlClientProvider messages={messages}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 16px',
          borderBottom: '1px solid #ddd',
          background: '#fafafa',
        }}
      >
        <span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Link href="/admin" style={{ fontWeight: 600, textDecoration: 'none', color: '#1a1a2e' }}>
            {t('cms')}
          </Link>
          <Link href="/admin/sites" style={{ fontSize: 14, color: '#555' }}>{t('sites')}</Link>
          <Link href="/admin/redirects" style={{ fontSize: 14, color: '#555' }}>{t('redirects')}</Link>
          <Link href="/admin/menus" style={{ fontSize: 14, color: '#555' }}>{t('menus')}</Link>
          <Link href="/admin/authors" style={{ fontSize: 14, color: '#555' }}>{t('authors')}</Link>
          <Link href="/admin/webhooks" style={{ fontSize: 14, color: '#555' }}>{t('webhooks')}</Link>
          <Link href="/admin/gsc" style={{ fontSize: 14, color: '#555' }}>{t('searchConsole')}</Link>
        </span>
        <span style={{ fontSize: 14, color: '#555', display: 'flex', gap: 8, alignItems: 'center' }}>
          <LocaleSwitcher current={locale} />
          {session.email} ({session.roles.join(', ') || 'no role'}) ·{' '}
          <a href="/api/auth/logout">{t('logout')}</a>
        </span>
      </header>
      {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
