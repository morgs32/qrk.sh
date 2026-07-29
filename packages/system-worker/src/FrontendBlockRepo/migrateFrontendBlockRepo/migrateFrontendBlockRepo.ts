import { migrateDb } from '@zerospin/core/drizzle/migrateDb';
import type {
  IDb,
  IDbConfig,
  IDbConfigSchema,
} from '@zerospin/core/drizzle/types';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';

/*
 * The legacy archive needs its authenticated target identity before its rows
 * can become lineage envelopes. This constructor migration therefore creates
 * missing current tables and validates that an existing archive is either the
 * exact legacy shape or the exact current shape. `recordPredecessor` performs
 * the transactional row rewrite once that immutable identity is available.
 */
export const migrateFrontendBlockRepo = Effect.fn(
  'FrontendBlockRepo.migrateFrontendBlockRepo',
)(function* <CONFIG extends IDbConfig>(props: {
  db: IDb<CONFIG>;
  schema: IDbConfigSchema<CONFIG>;
}): Effect.fn.Return<void, IAnyError> {
  yield* migrateDb({ db: props.db, schema: props.schema });

  yield* Effect.try({
    try: () => {
      const columns = props.db.all<{ name: string }>(
        sql.raw('PRAGMA table_info(frontendBlocks)'),
      );
      const hasLegacyBlock =
        columns.find(column => column.name === 'block') !== undefined;
      const hasCanonicalBytes =
        columns.find(column => column.name === 'canonicalBytes') !== undefined;
      const hasLineageBlock =
        columns.find(column => column.name === 'lineageBlock') !== undefined;
      if (
        (hasLegacyBlock && !hasCanonicalBytes && !hasLineageBlock) ||
        (!hasLegacyBlock && hasCanonicalBytes && hasLineageBlock)
      ) {
        return;
      }
      throw new ZerospinError({
        code: 'frontend-block-repo-schema-invalid',
        message:
          'FrontendBlockRepo archive is neither the complete legacy shape nor the complete lineage shape',
      });
    },
    catch: ZerospinError.catch({
      code: 'frontend-block-repo-migration-failed',
      message: 'Failed to inspect FrontendBlockRepo archive schema',
      preferCauseMessage: true,
    }),
  });
});
