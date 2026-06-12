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
    <a href={href} className="pk-card">
      {post.image?.src ? (
        <img
          src={post.image.src}
          srcSet={post.image.srcSet}
          sizes={'(max-width: 768px) 92vw, 360px'}
          alt={post.image.alt ?? ''}
          loading="lazy"
          decoding="async"
          className="pk-card-img"
        />
      ) : (
        <div className="pk-card-ph" />
      )}
      <div className="pk-card-body">
        <h3 className="pk-card-h">{post.title}</h3>
        {post.description && (
          <p className="pk-card-p">{post.description}</p>
        )}
        <small className="pk-card-meta">
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
