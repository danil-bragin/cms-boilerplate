import type { PostItem } from './post-list.js';

/**
 * Pure presentational post card — no server-only or client-only deps, so it is
 * safe to import from both the server (PostListServer) and client (PostPager).
 * Image URLs are pre-signed server-side and carried on the PostItem, so the
 * client never needs imgproxy keys.
 */
export function PostCard({ post }: { post: PostItem }) {
  const href = `/${post.locale}${post.path === '/' ? '' : post.path}`;
  return (
    <a
      href={href}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid #e6e8f0',
        background: '#fff',
        textDecoration: 'none',
        color: 'inherit',
        height: '100%',
        boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
      }}
    >
      {post.image?.src ? (
        <img
          src={post.image.src}
          srcSet={post.image.srcSet}
          sizes="(max-width: 768px) 100vw, 380px"
          alt={post.image.alt ?? ''}
          loading="lazy"
          decoding="async"
          style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block', background: '#eef1f6' }}
        />
      ) : (
        <div style={{ width: '100%', aspectRatio: '16 / 9', background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)' }} />
      )}
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <h3 style={{ margin: 0, fontSize: '1.2rem', lineHeight: 1.25, letterSpacing: -0.2 }}>{post.title}</h3>
        {post.description && (
          <p style={{ margin: 0, color: '#5b6072', lineHeight: 1.55, fontSize: 15, flex: 1 }}>{post.description}</p>
        )}
        <small style={{ color: '#8a90a2', fontSize: 13, marginTop: 4 }}>
          {post.author ? `${post.author} · ` : ''}
          <time dateTime={post.firstPublishedAt}>
            {new Date(post.firstPublishedAt).toLocaleDateString(post.locale, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </time>
        </small>
      </div>
    </a>
  );
}

export const postGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: 24,
} as const;
