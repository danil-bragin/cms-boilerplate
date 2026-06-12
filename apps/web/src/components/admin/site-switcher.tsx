'use client';

import { useRouter } from 'next/navigation';
import type { SiteDto } from '@cms/contracts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Site selector that navigates ?site= on the given base path. */
export function SiteSwitcher({ sites, current, basePath }: { sites: SiteDto[]; current: string; basePath: string }) {
  const router = useRouter();
  return (
    <Select value={current} onValueChange={(v) => router.push(`${basePath}?site=${v}`)}>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {sites.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.slug}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
