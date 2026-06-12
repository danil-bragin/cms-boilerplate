import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { listSites } from '../../actions';
import { CreatePageForm } from '@/components/admin/page-forms';
import { Card, CardContent } from '@/components/ui/card';

export default async function NewPageRoute({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const { site: siteParam } = await searchParams;
  const sitesResult = await listSites();
  if (!sitesResult.ok || !sitesResult.data?.length) {
    return <p className="text-muted-foreground">No sites yet.</p>;
  }
  const site = sitesResult.data.find((s) => s.id === siteParam) ?? sitesResult.data[0]!;

  return (
    <div>
      <Link href="/admin/pages" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Back to pages
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">New page</h1>
      <p className="mb-6 text-sm text-muted-foreground">in {site.slug}</p>
      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <CreatePageForm siteId={site.id} />
        </CardContent>
      </Card>
    </div>
  );
}
