import CachedHandler from '@trieb.work/nextjs-turbo-redis-cache';

/**
 * Hardened page/ISR cache handler.
 *
 * The default trieb handler blocks on Redis with no socket-level fast-fail.
 * Verified under the load stand (`docker pause` the cache Redis mid-traffic):
 * a FROZEN connection (TCP stays "connected", so node-redis never marks the
 * client "offline") leaves reads/writes hanging to the nginx upstream timeout —
 * 502/504 after 120-180s, ~24% errors. The page cache did NOT degrade to DB.
 *
 * Fixes injected via the socket options (only reachable through a subclass —
 * the env knobs only cover getTimeoutMs):
 *  - `getTimeoutMs: 200` — a cache GET unanswered in 200ms returns null, so Next
 *    renders from Postgres instead of blocking (the real degrade-to-origin path).
 *  - `socket.timeout: 2000` — a frozen/idle socket errors after 2s; node-redis
 *    then rejects in-flight commands and reconnects, instead of hanging.
 *  - bounded `reconnectStrategy` (cap 3s) + short `connectTimeout` — no
 *    tight-loop reconnect, dead host given up on fast.
 *
 * Net: a Redis outage degrades to direct-from-DB rendering (slower TTFB, not
 * 502s) and self-heals when Redis returns. Re-verify with the load stand after
 * any bump of redis / the cache handler.
 */
export default class HardenedCacheHandler extends CachedHandler {
  constructor(options) {
    super({
      ...options,
      getTimeoutMs: 200,
      socketOptions: {
        connectTimeout: 1000,
        timeout: 2000,
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
      },
    });
  }
}
