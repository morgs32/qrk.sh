/*
 * System-worker annotation:
 * Implements the AccountRepo execute Select Query operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import { checkSqlQuery } from '@zerospin/core/drizzle/checkSqlQuery';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IEncodedQuery } from '@zerospin/core/system/types';
import { ZerospinError } from '@zerospin/error';
import { sql, type SQLChunk } from 'drizzle-orm';
import { Effect } from 'effect';

import { queryExecutionFailureMessage } from '../../utils/queryExecutionFailureMessage.js';

export const executeSelectQuery = Effect.fn('AccountRepo.executeSelectQuery')(
  function* (props: { db: IDb; query: IEncodedQuery }) {
    const { db, query } = props;
    const checked = yield* checkSqlQuery({
      sql: query.rawSql,
      params: query.params,
    });
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
    if (!checked.readonly) {
      return yield* new ZerospinError({
        code: 'encoded-query-not-select',
        message: 'Encoded query must be a single SELECT.',
        extra: { sql: query.rawSql, types: checked.types },
      });
    }
    return yield* Effect.try({
      try: () => {
        const parts = query.rawSql.split('?');
        if (parts.length !== query.params.length + 1) {
          throw new ZerospinError({
            code: 'encoded-query-placeholder-mismatch',
            message: `rawSql has ${parts.length - 1} "?" and params has length ${query.params.length}; they must match (one ? per param).`,
          });
        }

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
  },
);
