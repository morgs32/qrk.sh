/*
 * System-worker annotation:
 * Lists the registered instances for one concrete repo type.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyDrizzleSchema } from '@zerospin/core/models/types';
import type { IRepoType } from '@zerospin/core/system/types';
import { ZerospinError } from '@zerospin/error';
import { and, asc, eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

const RepoTableNames = Schema.parseJson(Schema.Array(Schema.String));

export const getRepoRegistrations = Effect.fn(
  'SystemRepo.getRepoRegistrations',
)(function* (props: {
  db: IDb;
  generationId: string;
  repoTable: IAnyDrizzleSchema & {
    generationId: AnyColumn;
    repoType: AnyColumn;
    repoName: AnyColumn;
  };
  repoType: IRepoType;
}) {
  const { db, generationId, repoTable, repoType } = props;
  yield* Effect.void;
  const rows = db
    .select()
    .from(repoTable)
    .where(
      and(
        eq(repoTable.generationId, generationId),
        eq(repoTable.repoType, repoType),
      ),
    )
    .orderBy(asc(repoTable.repoName))
    .all();

  return yield* Effect.try({
    try: () =>
      Schema.decodeUnknownSync(
        Schema.Array(
          Schema.Struct({
            generationId: Schema.String,
            repoType: Schema.Literal(
              'SystemRepo',
              'AggregateRepo',
              'AggregateFrontendRepo',
              'ServiceFrontendRepo',
              'ServiceRepo',
              'AggregateBlockRepo',
              'AggregateFrontendBlockRepo',
              'ServiceFrontendBlockRepo',
              'ServiceBlockRepo',
              'SystemLogRepo',
            ),
            repoName: Schema.String,
            tableNames: Schema.String,
          }),
        ),
      )(rows).map(row => ({
        ...row,
        tableNames: Schema.decodeUnknownSync(RepoTableNames)(row.tableNames),
      })),
    catch: failure =>
      new ZerospinError({
        code: 'repo-registration-table-names-invalid',
        message: 'Registered repo table names are not valid JSON',
        cause: ZerospinError.prettyUnknownFailure(failure),
        extra: { repoType },
      }),
  });
});
