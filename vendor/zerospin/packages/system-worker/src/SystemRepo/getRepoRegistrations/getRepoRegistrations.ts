/*
 * System-worker annotation:
 * Lists the registered instances for one concrete repo type.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IRepoType } from '@zerospin/core/system/types';
import { ZerospinError } from '@zerospin/error';
import type { IAnyDrizzleSchema } from '@zerospin/schema';
import { asc, eq, type AnyColumn } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

const RepoTableNames = Schema.fromJsonString(Schema.Array(Schema.String));

/*
 * Secret-key inspection reads one concrete Repo kind from the singleton
 * SystemRepo catalog of explicit registrations.
 *
 * 1. Read explicit registrations for the requested Repo kind.
 * 2. Decode retained registrations and report malformed catalog data.
 */
export const getRepoRegistrations = Effect.fn(
  'SystemRepo.getRepoRegistrations',
)(function* (props: {
  db: IDb;
  repoTable: IAnyDrizzleSchema & {
    repoType: AnyColumn;
    repoName: AnyColumn;
  };
  repoType: IRepoType;
  systemId: string;
}) {
  const { db, repoTable, repoType } = props;
  // 1 — filter repoType and order by physical repoName
  const rows = db
    .select()
    .from(repoTable)
    .where(eq(repoTable.repoType, repoType))
    .orderBy(asc(repoTable.repoName))
    .all();

  // 2 — validate known Repo kinds and decode each JSON tableNames array
  return yield* Effect.try({
    try: () =>
      Schema.decodeUnknownSync(
        Schema.Array(
          Schema.Struct({
            repoType: Schema.Literals([
              'SystemRepo',
              'VersionedAggregateRepo',
              'UserVersionedAggregateRepo',
              'FrontendVersionedServiceRepo',
              'VersionedServiceRepo',
              'AggregateChain',
              'VersionedAggregateChain',
              'UserVersionedAggregateChain',
              'FrontendServiceChain',
              'ServiceAdmittedChain',
              'SystemLogRepo',
            ]),
            repoName: Schema.String,
            tableNames: Schema.String,
          }),
        ),
      )(rows).map(row => ({
        ...row,
        tableNames: Schema.decodeUnknownSync(RepoTableNames)(row.tableNames),
      })),

    // Retain the requested repoType and original decoding failure.
    catch: failure =>
      new ZerospinError({
        code: 'repo-registration-table-names-invalid',
        message: 'Registered repo table names are not valid JSON',
        cause: ZerospinError.prettyUnknownFailure(failure),
        extra: { repoType },
      }),
  });
});
