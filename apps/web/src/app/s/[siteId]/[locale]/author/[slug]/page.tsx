import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { imageUrl } from '@cms/puck-config';
import '@/lib/images.server';
import { getAuthor } from '@/lib/authors';
import { getSiteById, siteOrigin } from '@/lib/page-data';

export const revalidate = false;
export const dynamicParams = true;
export async function generateStaticParams(): Promise<Array<{ siteId: string; locale: string; slug: string }>> {
  return [{ siteId: '00000000-0000-0000-0000-000000000000', locale: 'en', slug: '_' }];
}

interface Params {
  siteId: string;
  locale: string;
  slug: string;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { siteId, locale, slug } = await params;
  if (siteId === '00000000-0000-0000-0000-000000000000') return {};
  const author = await getAuthor(siteId, slug, locale);
  const site = await getSiteById(siteId);
  if (!author || !site) return {};
  const origin = siteOrigin(site);
  const url = `${origin}/${locale}/author/${slug}`;
  return {
    metadataBase: new URL(origin),
    title: author.name,
    description: author.bio || `Posts by ${author.name}`,
    alternates: { canonical: url },
    openGraph: { type: 'profile', url, title: author.name, description: author.bio },
  };
}

export default async function AuthorPage({ params }: { params: Promise<Params> }) {
  const { siteId, locale, slug } = await params;
  if (siteId === '00000000-0000-0000-0000-000000000000') notFound();
  const author = await getAuthor(siteId, slug, locale);
  const site = await getSiteById(siteId);
  if (!author || !site) notFound();
  const origin = siteOrigin(site);
  const url = `${origin}/${locale}/author/${slug}`;
  const avatar = author.avatarKey ? imageUrl(author.avatarKey, { width: 200, height: 200 }) : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfilePage',
        '@id': `${url}/#profilepage`,
        url,
        mainEntity: { '@id': `${url}/#person` },
      },
      {
        '@type': 'Person',
        '@id': `${url}/#person`,
        name: author.name,
        url,
        ...(author.bio ? { description: author.bio } : {}),
        ...(avatar ? { image: avatar } : {}),
        ...(author.sameAs.length ? { sameAs: author.sameAs } : {}),
      },
    ],
  };

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <header style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
        {avatar && (
          <img src={avatar} alt={author.name} width={80} height={80} style={{ borderRadius: '50%' }} />
        )}
        <div>
          <h1 style={{ margin: 0 }}>{author.name}</h1>
          {author.bio && <p style={{ margin: '4px 0', color: '#555' }}>{author.bio}</p>}
          {author.sameAs.length > 0 && (
            <p style={{ margin: 0, fontSize: 14 }}>
              {author.sameAs.map((u) => (
                <a key={u} href={u} rel="me" style={{ marginRight: 8 }}>
                  {new URL(u).hostname.replace('www.', '')}
                </a>
              ))}
            </p>
          )}
        </div>
      </header>
      <h2>Posts</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        {author.posts.map((post) => (
          <article key={post.path}>
            <a href={`/${post.locale}${post.path === '/' ? '' : post.path}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <strong>{post.title}</strong>
            </a>{' '}
            <small style={{ color: '#888' }}>
              <time dateTime={post.firstPublishedAt}>
                {new Date(post.firstPublishedAt).toLocaleDateString(locale)}
              </time>
            </small>
          </article>
        ))}
        {author.posts.length === 0 && <p style={{ color: '#888' }}>No posts yet.</p>}
      </div>
    </main>
  );
}
