#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/6c023f44f87d8e7b83b2460922bf9307692fdbc98b070cbfcca56f710ee975ac/contract';
import startContract from '../../snapshots/6c023f44f87d8e7b83b2460922bf9307692fdbc98b070cbfcca56f710ee975ac/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/dda80a61246bf5e9a7ae93fdc54706ae9d335a7e4e2b3a87741b091b73360130/contract';
import endContract from '../../snapshots/dda80a61246bf5e9a7ae93fdc54706ae9d335a7e4e2b3a87741b091b73360130/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'documents',
        columns: [
          col('change_note', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('content', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('document_number', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('file_name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('is_current', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('issue_date', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('kind', 'text', {
            notNull: true,
            default: lit('datasheet'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('product_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('revision', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('text', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'documents',
        constraint: 'documents_document_number_revision_key',
        columns: ['document_number', 'revision'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'documents',
        index: 'documents_one_current_485286a3',
        columns: ['document_number'],
        extras: { where: 'is_current', unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'documents',
        index: 'documents_product_id_idx_22a2b7d2',
        columns: ['product_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'documents',
        foreignKey: {
          name: 'documents_product_id_fkey',
          columns: ['product_id'],
          references: { schema: 'public', table: 'products', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
