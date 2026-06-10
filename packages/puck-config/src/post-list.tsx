/**
 * PostList data is supplied by the host app (puck-config cannot reach the DB).
 * The web app injects a resolver server-side; in the editor canvas (client)
 * the component renders a static placeholder instead.
 */

export interface PostItem {
  path: string;
  locale: string;
  title: string;
  description: string;
  author: string | null;
  firstPublishedAt: string;
}

export type PostsResolver = (siteId: string, locale: string, limit: number) => Promise<PostItem[]>;

let resolver: PostsResolver | undefined;

export function configurePosts(next: PostsResolver): void {
  resolver = next;
}

export async function PostListServer({
  siteId,
  locale,
  limit,
  heading,
}: {
  siteId: string;
  locale: string;
  limit: number;
  heading: string;
}) {
  const posts = resolver ? await resolver(siteId, locale, limit) : [];
  return (
    <section>
      {heading && <h2>{heading}</h2>}
      {posts.length === 0 && <p style={{ color: '#888' }}>No posts yet.</p>}
      <div style={{ display: 'grid', gap: 16 }}>
        {posts.map((post) => (
          <article key={post.path} style={{ borderBottom: '1px solid #eee', paddingBottom: 12 }}>
            <h3 style={{ margin: '0 0 4px' }}>
              <a
                href={`/${post.locale}${post.path === '/' ? '' : post.path}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                {post.title}
              </a>
            </h3>
            <p style={{ margin: '0 0 4px', color: '#555' }}>{post.description}</p>
            <small style={{ color: '#888' }}>
              {post.author ? `${post.author} · ` : ''}
              <time dateTime={post.firstPublishedAt}>
                {new Date(post.firstPublishedAt).toLocaleDateString(post.locale)}
              </time>
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}
