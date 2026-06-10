import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHmac } from 'node:crypto';
import { CONFIG, type AppConfig } from '../config/config.js';

export const REVALIDATE_CLIENT = Symbol('REVALIDATE_CLIENT');
export const INVALIDATION_QUEUE = 'invalidation';

export interface RevalidateClient {
  invalidate(tags: string[]): Promise<void>;
}

export function signRevalidatePayload(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Calls the Next.js internal revalidation endpoint. Shared Redis cache handler
 * propagates the tag invalidation to every web replica. On failure the job is
 * queued for retry — the DB is already correct, pages are merely stale until then.
 */
@Injectable()
export class HttpRevalidateClient implements RevalidateClient {
  private readonly logger = new Logger(HttpRevalidateClient.name);

  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    @Optional() @InjectQueue(INVALIDATION_QUEUE) private readonly queue?: Queue,
  ) {}

  async invalidate(tags: string[]): Promise<void> {
    try {
      await postRevalidate(this.cfg.WEB_INTERNAL_URL, this.cfg.REVALIDATE_SECRET, tags);
    } catch (err) {
      this.logger.warn(`revalidate failed for [${tags.join(', ')}]: ${String(err)}; queueing retry`);
      await this.queue?.add(
        'invalidate',
        { tags },
        { attempts: 5, backoff: { type: 'exponential', delay: 2000 } },
      );
    }
  }
}

export async function postRevalidate(webUrl: string, secret: string, tags: string[]): Promise<void> {
  const body = JSON.stringify({ tags });
  const res = await fetch(`${webUrl}/api/revalidate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-revalidate-signature': signRevalidatePayload(body, secret),
    },
    body,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`revalidate endpoint returned ${res.status}`);
}
