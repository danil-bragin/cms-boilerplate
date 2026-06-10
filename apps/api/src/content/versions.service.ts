import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { pageLocales, pageVersions } from '@cms/db';
import type { PuckData } from '@cms/contracts';
import { DB, type Db } from '../db/db.module.js';

@Injectable()
export class VersionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listVersions(pageLocaleId: string) {
    await this.assertLocale(pageLocaleId);
    return this.db.query.pageVersions.findMany({
      where: eq(pageVersions.pageLocaleId, pageLocaleId),
      orderBy: desc(pageVersions.versionNo),
      columns: { puckData: false },
    });
  }

  async getVersion(versionId: string) {
    const version = await this.db.query.pageVersions.findFirst({
      where: eq(pageVersions.id, versionId),
    });
    if (!version) {
      throw new NotFoundException({ code: 'version_not_found', message: 'Version not found' });
    }
    return version;
  }

  /**
   * Draft semantics: latest version draft → overwrite in place;
   * latest published/archived → new version (latest+1).
   * `baseVersionNo` enables optimistic concurrency for editor autosave.
   */
  async saveDraft(
    pageLocaleId: string,
    puckData: PuckData,
    createdBy: string,
    baseVersionNo?: number,
  ) {
    await this.assertLocale(pageLocaleId);

    return this.db.transaction(async (tx) => {
      const latest = await tx.query.pageVersions.findFirst({
        where: eq(pageVersions.pageLocaleId, pageLocaleId),
        orderBy: desc(pageVersions.versionNo),
      });

      if (baseVersionNo !== undefined && latest && latest.versionNo !== baseVersionNo) {
        throw new ConflictException({
          code: 'stale_draft',
          message: `Draft is based on v${baseVersionNo} but latest is v${latest.versionNo}`,
        });
      }

      if (latest && latest.status === 'draft') {
        const [updated] = await tx
          .update(pageVersions)
          .set({ puckData })
          .where(eq(pageVersions.id, latest.id))
          .returning();
        return updated!;
      }

      const [created] = await tx
        .insert(pageVersions)
        .values({
          pageLocaleId,
          versionNo: (latest?.versionNo ?? 0) + 1,
          puckData,
          createdBy,
        })
        .returning();
      return created!;
    });
  }

  private async assertLocale(pageLocaleId: string) {
    const locale = await this.db.query.pageLocales.findFirst({
      where: eq(pageLocales.id, pageLocaleId),
    });
    if (!locale) {
      throw new NotFoundException({ code: 'page_locale_not_found', message: 'Page locale not found' });
    }
    return locale;
  }
}
