import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, type Job } from 'bullmq';
import { and, eq } from 'drizzle-orm';
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

    const [row] = await this.db
      .insert(scheduledPublishes)
      .values({ pageLocaleId, versionId, publishAt, createdBy })
      .returning();

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
    return row!;
  }

  async cancel(scheduleId: string) {
    const row = await this.db.query.scheduledPublishes.findFirst({
      where: eq(scheduledPublishes.id, scheduleId),
    });
    if (!row) throw new NotFoundException({ code: 'schedule_not_found', message: 'Not found' });
    if (row.status !== 'pending') {
      throw new BadRequestException({ code: 'not_pending', message: `Already ${row.status}` });
    }
    const job = await this.queue.getJob(scheduleId);
    await job?.remove();
    await this.db
      .update(scheduledPublishes)
      .set({ status: 'cancelled' })
      .where(eq(scheduledPublishes.id, scheduleId));
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
      await this.publishService.publish(row.pageLocaleId, row.versionId);
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
