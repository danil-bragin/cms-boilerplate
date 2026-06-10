import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, type Job } from 'bullmq';
import { and, desc, eq } from 'drizzle-orm';
import { pageVersions, scheduledPublishes } from '@cms/db';
import { DB, type Db } from '../db/db.module.js';
import { PublishService } from './publish.service.js';

export const SCHEDULE_QUEUE = 'scheduled-publish';

@Injectable()
export class ScheduleService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @InjectQueue(SCHEDULE_QUEUE) private readonly queue: Queue,
  ) {}

  async list(pageLocaleId: string) {
    return this.db.query.scheduledPublishes.findMany({
      where: eq(scheduledPublishes.pageLocaleId, pageLocaleId),
      orderBy: scheduledPublishes.publishAt,
    });
  }

  async schedule(pageLocaleId: string, versionId: string, publishAt: Date, createdBy: string) {
    if (publishAt.getTime() <= Date.now()) {
      throw new BadRequestException({ code: 'past_date', message: 'publishAt must be in the future' });
    }
    const version = await this.db.query.pageVersions.findFirst({
      where: and(eq(pageVersions.id, versionId), eq(pageVersions.pageLocaleId, pageLocaleId)),
    });
    if (!version) {
      throw new NotFoundException({ code: 'version_not_found', message: 'Version not found' });
    }

    // freeze the content: what was approved at schedule time is what publishes,
    // even if the draft (same versionId) is edited afterwards
    const [row] = await this.db
      .insert(scheduledPublishes)
      .values({ pageLocaleId, versionId, puckData: version.puckData, publishAt, createdBy })
      .returning();

    try {
      await this.queue.add(
        'publish',
        { scheduleId: row!.id },
        {
          jobId: row!.id, // makes cancellation a simple queue.remove
          delay: publishAt.getTime() - Date.now(),
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
        },
      );
    } catch (err) {
      // never leave a pending row with no job behind it
      await this.db.delete(scheduledPublishes).where(eq(scheduledPublishes.id, row!.id));
      throw err;
    }
    return row!;
  }

  async cancel(scheduleId: string) {
    // conditional update first: only a still-pending row can be cancelled —
    // a schedule that completed between read and write stays 'done'
    const updated = await this.db
      .update(scheduledPublishes)
      .set({ status: 'cancelled' })
      .where(and(eq(scheduledPublishes.id, scheduleId), eq(scheduledPublishes.status, 'pending')))
      .returning();
    if (updated.length === 0) {
      const row = await this.db.query.scheduledPublishes.findFirst({
        where: eq(scheduledPublishes.id, scheduleId),
      });
      if (!row) throw new NotFoundException({ code: 'schedule_not_found', message: 'Not found' });
      throw new BadRequestException({ code: 'not_pending', message: `Already ${row.status}` });
    }
    try {
      const job = await this.queue.getJob(scheduleId);
      await job?.remove();
    } catch {
      // job already running: the processor re-checks status and will see 'cancelled'
    }
    return { ok: true };
  }
}

/**
 * Executes due scheduled publishes. Lives in the API process (BullMQ
 * coordinates across replicas — exactly one consumer gets each job).
 */
@Processor(SCHEDULE_QUEUE)
export class ScheduleProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduleProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PublishService) private readonly publishService: PublishService,
  ) {
    super();
  }

  async process(job: Job<{ scheduleId: string }>): Promise<void> {
    const row = await this.db.query.scheduledPublishes.findFirst({
      where: eq(scheduledPublishes.id, job.data.scheduleId),
    });
    if (!row || row.status !== 'pending') return; // cancelled or gone

    try {
      // materialize the frozen snapshot as a new immutable version, then publish it
      const latest = await this.db.query.pageVersions.findFirst({
        where: eq(pageVersions.pageLocaleId, row.pageLocaleId),
        orderBy: [desc(pageVersions.versionNo)],
      });
      const [frozen] = await this.db
        .insert(pageVersions)
        .values({
          pageLocaleId: row.pageLocaleId,
          versionNo: (latest?.versionNo ?? 0) + 1,
          puckData: row.puckData,
          createdBy: row.createdBy,
        })
        .returning();
      await this.publishService.publish(row.pageLocaleId, frozen!.id);
      await this.db
        .update(scheduledPublishes)
        .set({ status: 'done' })
        .where(eq(scheduledPublishes.id, row.id));
      this.logger.log(`scheduled publish ${row.id} executed`);
    } catch (err) {
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.db
          .update(scheduledPublishes)
          .set({ status: 'failed' })
          .where(eq(scheduledPublishes.id, row.id));
      }
      throw err;
    }
  }
}
