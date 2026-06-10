import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  output: 'standalone',
  turbopack: { root: path.join(__dirname, '../..') },
  // Shared ISR/data cache across replicas. In dev the default in-memory
  // handler is fine; in production every replica must point at the same Redis.
  cacheHandler:
    process.env.NODE_ENV === 'production'
      ? require.resolve('@trieb.work/nextjs-turbo-redis-cache')
      : undefined,
  cacheMaxMemorySize: 0,
  transpilePackages: ['@cms/puck-config', '@cms/db', '@cms/contracts', '@cms/auth'],
  // memoizes client components (admin editor) automatically; public pages are
  // RSC-only so the win is editor INP, at some build-time cost
  reactCompiler: true,
  async headers() {
    const imgproxy = process.env.NEXT_PUBLIC_IMGPROXY_URL ?? process.env.IMGPROXY_URL;
    return [
      {
        source: '/:path*',
        headers: [
          // bfcache insurance: third-party scripts can't register unload handlers
          { key: 'Permissions-Policy', value: 'unload=()' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            // Baseline CSP. 'unsafe-inline' for scripts is required by the inline
            // JSON-LD + speculation-rules scripts (and Next's bootstrap); tighten
            // to nonces if you add third-party scripts. frame-ancestors blocks
            // clickjacking; imgproxy origin is allowed for images.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              `img-src 'self' data: blob:${imgproxy ? ` ${imgproxy}` : ''}`,
              "font-src 'self'",
              `connect-src 'self'${process.env.NEXT_PUBLIC_API_URL ? ` ${process.env.NEXT_PUBLIC_API_URL}` : ''} ${process.env.S3_ENDPOINT ?? ''}`.trim(),
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          // CDNs (Cloudflare et al.) lift Link headers into 103 Early Hints;
          // nginx >=1.29.8 proxies them (see infra/nginx/nginx.conf)
          ...(imgproxy ? [{ key: 'Link', value: `<${imgproxy}>; rel=preconnect` }] : []),
        ],
      },
    ];
  },
};

export default config;
