import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { StructuredLogger } from '../../common/http/structured-logger.js';
import { requestContext } from '../../common/http/request-context.js';

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly logger: StructuredLogger,
  ) {}
  async ping() {
    const db = this.database.db;
    await db
      .runtime()
      .query(
        db.raw.sql`SELECT 1 AS ok`.returnsRow({ ok: 'pg/int4@1' }).build(),
      );
  }
  async ready() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.ping(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Readiness timeout')),
            2000,
          );
        }),
      ]);
      return true;
    } catch (error: unknown) {
      const c = requestContext.getStore();
      this.logger.write(
        {
          type: 'readiness_failure',
          requestId: c?.requestId,
          errorType: error instanceof Error ? error.name : 'UnknownError',
          message:
            error instanceof Error ? error.message : 'Database unavailable',
        },
        true,
      );
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
