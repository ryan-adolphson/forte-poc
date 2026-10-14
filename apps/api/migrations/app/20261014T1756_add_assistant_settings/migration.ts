#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/31ce96f3db7981ce65817ba31792b95aa35039446cb2b1a0a3a234a5a8bdbc0e/contract';
import endContract from '../../snapshots/31ce96f3db7981ce65817ba31792b95aa35039446cb2b1a0a3a234a5a8bdbc0e/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/dda80a61246bf5e9a7ae93fdc54706ae9d335a7e4e2b3a87741b091b73360130/contract';
import startContract from '../../snapshots/dda80a61246bf5e9a7ae93fdc54706ae9d335a7e4e2b3a87741b091b73360130/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'assistant_settings',
        columns: [
          col('id', 'int4', { notNull: true, default: lit(1), codecRef: { codecId: 'pg/int4@1' } }),
          col('model', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('provider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('assistant_settings_single_row_7faf435e', 'id = 1'),
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
