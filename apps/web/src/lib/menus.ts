import 'server-only';
import { unstable_cache } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { menus } from '@cms/db';
import type { MenuItem } from '@cms/contracts';
import { db } from './db';

/**
 * Cached menu lookup for site layouts/components. Invalidated via the
 * `menu:{siteId}:{slug}` tag whenever the menu is saved in the admin.
 *
 * Usage in a layout or custom component:
 *   const items = await getMenu(siteId, 'main');
 *   <nav>{items.map((i) => <a key={i.href} href={i.href}>{i.label[locale]}</a>)}</nav>
 */
export const getMenu = (siteId: string, slug: string) =>
  unstable_cache(
    async (): Promise<MenuItem[]> => {
      const row = await db().query.menus.findFirst({
        where: and(eq(menus.siteId, siteId), eq(menus.slug, slug)),
      });
      return (row?.items as MenuItem[]) ?? [];
    },
    ['menu', siteId, slug],
    { tags: [`menu:${siteId}:${slug}`] },
  )();
