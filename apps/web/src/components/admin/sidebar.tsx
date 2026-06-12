'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Globe,
  FileText,
  Menu as MenuIcon,
  Webhook,
  Users,
  Search,
  CornerUpRight,
  LayoutDashboard,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme-toggle';

// CONTENT group then SETTINGS group (separator between)
const contentItems = [
  { href: '/admin/pages', key: 'pages', icon: FileText },
  { href: '/admin/menus', key: 'menus', icon: MenuIcon },
  { href: '/admin/authors', key: 'authors', icon: Users },
  { href: '/admin/redirects', key: 'redirects', icon: CornerUpRight },
] as const;
const settingsItems = [
  { href: '/admin/sites', key: 'sites', icon: Globe },
  { href: '/admin/webhooks', key: 'webhooks', icon: Webhook },
  { href: '/admin/gsc', key: 'searchConsole', icon: Search },
] as const;

export function Sidebar({
  locale,
  theme,
  email,
  roles,
}: {
  locale: string;
  theme: 'light' | 'dark';
  email: string;
  roles: string[];
}) {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 py-4 text-base font-semibold">
        <LayoutDashboard className="h-5 w-5" />
        {t('cms')}
      </div>
      <nav className="flex-1 space-y-1 px-3">
        <NavGroup items={contentItems} pathname={pathname} t={t} />
        <div className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
          {t('settings')}
        </div>
        <NavGroup items={settingsItems} pathname={pathname} t={t} />
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <LocaleSwitcher current={locale} />
          <ThemeToggle theme={theme} />
        </div>
        <div className="truncate px-1 text-xs text-muted-foreground" title={email}>
          {email}
        </div>
        <div className="px-1 text-[11px] text-muted-foreground/70">{roles.join(', ') || 'no role'}</div>
        <a href="/api/auth/logout" className="mt-2 block px-1 text-xs text-muted-foreground hover:text-foreground">
          {t('logout')}
        </a>
      </div>
    </aside>
  );
}

function NavGroup({
  items,
  pathname,
  t,
}: {
  items: ReadonlyArray<{ href: string; key: string; icon: typeof FileText }>;
  pathname: string;
  t: (k: string) => string;
}) {
  return (
    <>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-sidebar-accent text-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {t(item.key)}
          </Link>
        );
      })}
    </>
  );
}
