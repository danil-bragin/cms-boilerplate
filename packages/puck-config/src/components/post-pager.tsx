'use client';

import { useEffect, useState } from 'react';
import type { PostItem } from '../post-list.js';

/**
 * Client pagination for PostList. Initial page is server-rendered (crawlable +
 * cached); further pages load from /api/posts on click. Older posts are
 * discoverable by crawlers via the sitemap regardless.
 */
export function PostPager({
  initial,
  totalPages,
  perPage,
}: {
  initial: PostItem[];
  totalPages: number;
  perPage: number;
}) {
  const [posts, setPosts] = useState(initial);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (page === 1) {
      setPosts(initial);
      return;
    }
    const locale = window.location.pathname.split('/')[1] ?? '';
    setLoading(true);
    fetch(`/api/posts?locale=${locale}&page=${page}&perPage=${perPage}`)
      .then((r) => r.json())
      .then((d: { posts: PostItem[] }) => setPosts(d.posts))
      .finally(() => setLoading(false));
  }, [page, perPage, initial]);

  return (
    <>
      <div style={{ display: 'grid', gap: 16, opacity: loading ? 0.5 : 1 }}>
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
      {totalPages > 1 && (
        <nav style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </button>
          <span style={{ color: '#888' }}>
            {page} / {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next →
          </button>
        </nav>
      )}
    </>
  );
}
