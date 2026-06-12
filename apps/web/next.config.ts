import type { NextConfig } from 'next';
import path from 'node:path';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  output: 'standalone',
  turbopack: { root: path.join(__dirname, '../..') },
  // Shared ISR/data cache across replicas. In dev the default in-memory
  // handler is fine; in production every replica must point at the same Redis.
  cacheHandler:
    process.env.NODE_ENV === 'production'
      ? require.resolve('./cache-handler.mjs')
      : undefined,
  cacheMaxMemorySize: 0,
  transpilePackages: ['@cms/puck-config', '@cms/db', '@cms/contracts', '@cms/auth'],
  // memoizes client components (admin editor) automatically; public pages are
  // RSC-only so the win is editor INP, at some build-time cost
  reactCompiler: true,
  async headers() {
    const imgproxy = process.env.NEXT_PUBLIC_IMGPROXY_URL ?? process.env.IMGPROXY_URL;
    const common = [
      // bfcache insurance: third-party scripts can't register unload handlers
      { key: 'Permissions-Policy', value: 'unload=()' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ];
    // CDNs (Cloudflare et al.) lift Link headers into 103 Early Hints;
    // nginx >=1.29.8 proxies them (see infra/nginx/nginx.conf)
    // skip the cross-origin preconnect when images are served same-origin (behind nginx)
    const sameOriginImages = (process.env.IMAGE_PUBLIC_BASE ?? '').startsWith('/');
    const linkHeader =
      imgproxy && !sameOriginImages ? [{ key: 'Link', value: `<${imgproxy}>; rel=preconnect` }] : [];
    // Baseline CSP. 'unsafe-inline' for scripts is required by the inline JSON-LD
    // + speculation-rules scripts (and Next's bootstrap). The public site is
    // RSC-only and stays strict (no eval). The admin (behind auth, noindex) runs
    // the Puck editor + React Compiler runtime which need 'unsafe-eval'.
    const csp = (scriptSrc: string, extraStyle = '', extraFont = '') =>
      [
        "default-src 'self'",
        scriptSrc,
        `style-src 'self' 'unsafe-inline'${extraStyle}`,
        `img-src 'self' data: blob:${imgproxy ? ` ${imgproxy}` : ''}`,
        `font-src 'self'${extraFont}`,
        `connect-src 'self'${process.env.NEXT_PUBLIC_API_URL ? ` ${process.env.NEXT_PUBLIC_API_URL}` : ''} ${process.env.S3_ENDPOINT ?? ''}`.trim(),
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ');
    return [
      {
        source: '/admin/:path*',
        headers: [
          ...common,
          {
            key: 'Content-Security-Policy',
            // Puck editor pulls the Inter webfont stylesheet from rsms.me
            value: csp("script-src 'self' 'unsafe-inline' 'unsafe-eval'", ' https://rsms.me', ' https://rsms.me'),
          },
          ...linkHeader,
        ],
      },
      {
        // everything except /admin — strict, no eval
        source: '/((?!admin).*)',
        headers: [
          ...common,
          { key: 'Content-Security-Policy', value: csp("script-src 'self' 'unsafe-inline'") },
          ...linkHeader,
        ],
      },
    ];
  },
};

export default withNextIntl(config);
