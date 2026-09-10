/*
 * System-worker annotation:
 * Implements the VersionedAggregateRepo execute Select Query operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import { checkSqlQuery } from '@zerospin/core/drizzle/checkSqlQuery';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IEncodedQuery } from '@zerospin/core/system/types';
import { ZerospinError } from '@zerospin/error';
import { sql, type SQLChunk } from 'drizzle-orm';
import { Effect } from 'effect';

import { queryExecutionFailureMessage } from '../../utils/queryExecutionFailureMessage.js';

/*
 * The aggregate materializer executes the encoded SQL read accepted by
 * SystemApi. It checks read-only SQL and parameter shape before constructing
 * bound Drizzle SQL for its local database.
 *
 * 1. Inspect SQL and parameter shape.
 * 2. Reject invalid SQL analysis.
 * 3. Require a single read-only query.
 * 4. Check placeholder cardinality.
 * 5. Build bound SQL and execute the requested read.
 * 6. Report execution failure details.
 */
export const executeSelectQuery = Effect.fn(
  'VersionedAggregateRepo.executeSelectQuery',
)(function* (props: { db: IDb; query: IEncodedQuery }) {
  const { db, query } = props;

  // 1 — run checkSqlQuery against rawSql and params
  const checked = yield* checkSqlQuery({
    sql: query.rawSql,
    params: query.params,
  });

  // 2 — return the checker error and inferred parameter types
  if (checked.error !== undefined) {
    return yield* new ZerospinError({
      code: 'encoded-query-sql-check-failed',
      message: `Encoded query failed SQL parameter/readonly check: ${checked.error}`,
      extra: {
        checkError: checked.error,
        sql: query.rawSql,
        types: checked.types,
      },
    });
  }

  // 3 — reject statements that are not a single SELECT
  if (!checked.readonly) {
    return yield* new ZerospinError({
      code: 'encoded-query-not-select',
      message: 'Encoded query must be a single SELECT.',
      extra: { sql: query.rawSql, types: checked.types },
    });
  }
  return yield* Effect.try({
    try: () => {
      // 4 — require one question-mark placeholder per supplied parameter
      const parts = query.rawSql.split('?');
      if (parts.length !== query.params.length + 1) {
        throw new ZerospinError({
          code: 'encoded-query-placeholder-mismatch',
          message: `rawSql has ${parts.length - 1} "?" and params has length ${query.params.length}; they must match (one ? per param).`,
        });
      }

      // 5 — interleave sql.raw fragments with sql.param values, then call get or all
      const chunks: SQLChunk[] = [];
      for (let index = 0; index < query.params.length; index += 1) {
        chunks.push(sql.raw(parts[index]!));
        chunks.push(sql.param(query.params[index]!));
      }
      chunks.push(sql.raw(parts[query.params.length]!));
      const builtSql = sql.join(chunks);

      if (query.method === 'get') {
        return db.get(builtSql);
      }
      return db.all(builtSql);
    },

    // 6 — extract the underlying SQLite message and retain the full failure cause
    catch: failure => {
      const underlying =
        failure instanceof ZerospinError && failure.cause != null
          ? failure.cause
          : failure;
      return new ZerospinError({
        code: 'system-repo-run-query-failed',
        message: `Failed to run encoded query: ${queryExecutionFailureMessage(
          underlying,
        )}`,
        cause: ZerospinError.prettyUnknownFailure(failure),
      });
    },
  });
});
