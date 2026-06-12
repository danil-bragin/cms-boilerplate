'use client';

import { useEffect, useState } from 'react';
import type { PostItem } from '../post-list.js';
import { PostCard, postGridStyle } from '../post-card.js';

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
      <div style={{ ...postGridStyle, opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
        {posts.map((post) => (
          <PostCard key={post.path} post={post} />
        ))}
      </div>
      {totalPages > 1 && (
        <nav style={{ display: 'flex', gap: 8, marginTop: 28, alignItems: 'center', justifyContent: 'center' }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e6e8f0', background: '#fff', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
          >
            ← Prev
          </button>
          <span style={{ color: '#8a90a2', fontSize: 14 }}>
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e6e8f0', background: '#fff', cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}
          >
            Next →
          </button>
        </nav>
      )}
    </>
  );
}
