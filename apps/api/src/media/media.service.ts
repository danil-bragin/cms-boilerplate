import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { media } from '@cms/db';
import { MAX_UPLOAD_BYTES, type MediaListQuery, type PresignResult } from '@cms/contracts';
import { CONFIG, type AppConfig } from '../config/config.js';
import { DB, type Db } from '../db/db.module.js';
import { S3 } from './s3.provider.js';

export const MEDIA_QUEUE = 'media-process';

const PRESIGN_TTL_SECONDS = 600;

@Injectable()
export class MediaService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(S3) private readonly s3: S3Client,
    @Inject(CONFIG) private readonly cfg: AppConfig,
    @InjectQueue(MEDIA_QUEUE) private readonly queue: Queue,
  ) {}

  async presign(siteId: string, filename: string, mime: string, size: number, createdBy: string): Promise<PresignResult> {
    const [row] = await this.db
      .insert(media)
      .values({ siteId, s3Key: 'pending', mime, size, createdBy })
      .returning();
    const s3Key = `sites/${siteId}/media/${row!.id}/${sanitizeFilename(filename)}`;
    await this.db.update(media).set({ s3Key }).where(eq(media.id, row!.id));

    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: s3Key, ContentType: mime }),
      { expiresIn: PRESIGN_TTL_SECONDS },
    );
    return { mediaId: row!.id, uploadUrl, s3Key };
  }

  async confirm(mediaId: string) {
    const row = await this.mustGet(mediaId);

    let actualSize: number;
    try {
      const head = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: row.s3Key }),
      );
      actualSize = head.ContentLength ?? 0;
    } catch {
      throw new ConflictException({
        code: 'object_missing',
        message: 'Object not found in storage — upload first',
      });
    }
    if (actualSize > MAX_UPLOAD_BYTES) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: row.s3Key }));
      await this.db.update(media).set({ status: 'failed' }).where(eq(media.id, mediaId));
      throw new ConflictException({ code: 'object_too_large', message: 'Uploaded object exceeds size limit' });
    }

    await this.db.update(media).set({ size: actualSize }).where(eq(media.id, mediaId));
    await this.queue.add(
      'process',
      { mediaId },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );
    return { accepted: true };
  }

  async list(siteId: string, query: MediaListQuery) {
    // keyset pagination on (created_at, id) — matches the sort order, unlike a bare uuid cursor
    let cursorCond;
    if (query.cursor) {
      const cursorRow = await this.db.query.media.findFirst({
        where: eq(media.id, query.cursor),
        columns: { createdAt: true, id: true },
      });
      if (cursorRow) {
        cursorCond = or(
          lt(media.createdAt, cursorRow.createdAt),
          and(eq(media.createdAt, cursorRow.createdAt), lt(media.id, cursorRow.id)),
        );
      }
    }
    return this.db.query.media.findMany({
      where: and(
        eq(media.siteId, siteId),
        query.status ? eq(media.status, query.status) : undefined,
        cursorCond,
      ),
      orderBy: [desc(media.createdAt), desc(media.id)],
      limit: query.limit,
    });
  }

  async updateAlt(mediaId: string, alt: Record<string, string>) {
    await this.mustGet(mediaId);
    const [updated] = await this.db.update(media).set({ alt }).where(eq(media.id, mediaId)).returning();
    return updated!;
  }

  async delete(mediaId: string) {
    const row = await this.mustGet(mediaId);
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.cfg.S3_BUCKET, Key: row.s3Key }));
    await this.db.delete(media).where(eq(media.id, mediaId));
    return { ok: true };
  }

  private async mustGet(mediaId: string) {
    const row = await this.db.query.media.findFirst({ where: eq(media.id, mediaId) });
    if (!row) throw new NotFoundException({ code: 'media_not_found', message: 'Media not found' });
    return row;
  }
}

/** url-safe ascii, extension preserved */
export function sanitizeFilename(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const base = (dot > 0 ? filename.slice(0, dot) : filename)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  const ext = dot > 0 ? filename.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) : '';
  return `${base || 'file'}${ext ? '.' + ext : ''}`;
}
