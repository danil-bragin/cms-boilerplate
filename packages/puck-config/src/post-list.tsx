/**
 * PostList data is supplied by the host app (puck-config cannot reach the DB).
 * The web app injects a resolver server-side; in the editor canvas (client)
 * the component renders a static placeholder instead.
 */
import { PostCard, postGridStyle } from './post-card.js';

export interface PostImage {
  /** pre-signed imgproxy URL (built server-side) so the client never needs keys */
  src: string;
  srcSet: string;
  blurDataUrl?: string | null;
  alt?: string;
}

export interface PostItem {
  path: string;
  locale: string;
  title: string;
  description: string;
  author: string | null;
  firstPublishedAt: string;
  image?: PostImage | null;
}

export type PostsResolver = (siteId: string, locale: string, limit: number) => Promise<PostItem[]>;
export type PostsPageResolver = (
  siteId: string,
  locale: string,
  page: number,
  perPage: number,
) => Promise<{ posts: PostItem[]; totalPages: number }>;

let resolver: PostsResolver | undefined;
let pageResolver: PostsPageResolver | undefined;

export function configurePosts(next: PostsResolver, paged?: PostsPageResolver): void {
  resolver = next;
  pageResolver = paged;
}

const headingStyle = { margin: '0 0 24px', fontSize: '1.6rem', fontWeight: 700, letterSpacing: -0.4 } as const;
const emptyStyle = { color: '#8a90a2' } as const;

export async function PostListServer({
  siteId,
  locale,
  limit,
  heading,
  paginated,
}: {
  siteId: string;
  locale: string;
  limit: number;
  heading: string;
  paginated?: boolean;
}) {
  if (paginated && pageResolver) {
    const { posts, totalPages } = await pageResolver(siteId, locale, 1, limit);
    const { PostPager } = await import('./components/post-pager.js');
    return (
      <section>
        {heading && <h2 style={headingStyle}>{heading}</h2>}
        {posts.length === 0 && <p style={emptyStyle}>No posts yet.</p>}
        <PostPager initial={posts} totalPages={totalPages} perPage={limit} />
      </section>
    );
  }
  const posts = resolver ? await resolver(siteId, locale, limit) : [];
  return (
    <section>
      {heading && <h2 style={headingStyle}>{heading}</h2>}
      {posts.length === 0 && <p style={emptyStyle}>No posts yet.</p>}
      <div style={postGridStyle}>
        {posts.map((post) => (
          <PostCard key={post.path} post={post} />
        ))}
      </div>
    </section>
  );
}
