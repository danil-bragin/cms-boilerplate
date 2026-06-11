import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errors = new Rate('errors');
const cacheHit = new Rate('next_cache_hit');
const ttfbCached = new Trend('ttfb_cached_pages', true);

const BASE = __ENV.TARGET || 'http://localhost:8088';

// realistic mix: hot pages dominate, long tail of 404 scanners, seo endpoints
const HOT = ['/en', '/en/about', '/en/real-post'];

export const options = {
  scenarios: {
    traffic: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 50 },
        { duration: '60s', target: 50 },
        { duration: '20s', target: 150 },
        { duration: '60s', target: 150 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    errors: ['rate<0.01'],
    http_req_duration: ['p(95)<300', 'p(99)<800'],
    ttfb_cached_pages: ['p(95)<200'],
  },
};

export default function () {
  const r = Math.random();
  let res;
  if (r < 0.8) {
    const path = HOT[Math.floor(Math.random() * HOT.length)];
    res = http.get(`${BASE}${path}`);
    check(res, { 'page 200': (x) => x.status === 200 });
    errors.add(res.status !== 200);
    cacheHit.add(res.headers['X-Nextjs-Cache'] === 'HIT');
    ttfbCached.add(res.timings.waiting);
  } else if (r < 0.9) {
    res = http.get(`${BASE}/en/scanner-junk-${Math.floor(Math.random() * 100000)}`);
    check(res, { 'junk 404': (x) => x.status === 404 });
    errors.add(res.status !== 404);
  } else if (r < 0.95) {
    res = http.get(`${BASE}/sitemap.xml`);
    errors.add(res.status !== 200);
  } else {
    res = http.get(`${BASE}/api/search?q=post`);
    errors.add(res.status !== 200 && res.status !== 429);
  }
  sleep(0.1 + Math.random() * 0.4);
}
