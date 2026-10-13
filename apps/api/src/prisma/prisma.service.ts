import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import postgres from '@prisma/orm-postgres/runtime';
import { appConfig, type AppConfig } from '../config/app.config.js';
import type { Contract } from './contract.js';
import contractJson from './contract.json' with { type: 'json' };

/**
 * The one Prisma 8 client for the process. Query through `prisma.db.orm.public.<Model>`.
 * The client connects lazily on the first query and its pool is closed on shutdown.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly db: ReturnType<typeof postgres<Contract>>;

  constructor(@Inject(appConfig.KEY) config: AppConfig) {
    this.db = postgres<Contract>({ contractJson, url: config.databaseUrl });
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.close();
  }
}
