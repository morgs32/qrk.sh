/*
 * System-worker annotation:
 * Lists the registered instances for one concrete repo type.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import type { IRepoRegistration, IRepoType } from '@zerospin/core/system/types';
import { ZerospinError } from '@zerospin/error';
import { asc, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

const RepoTableNames = Schema.parseJson(Schema.Array(Schema.String));

export const getRepoRegistrations = Effect.fn(
  'SystemRepo.getRepoRegistrations',
)(function* (props: { db: IDb; repoTable: unknown; repoType: IRepoType }) {
  const { db, repoTable, repoType } = props;
  yield* Effect.void;
  const rows = db
    .select()
    .from(repoTable as never)
    .where(eq((repoTable as { repoType: never }).repoType, repoType))
    .orderBy(asc((repoTable as { repoName: never }).repoName))
    .all() as Array<{
    repoType: IRepoType;
    repoName: string;
    tableNames: string;
  }>;

  return yield* Effect.try({
    try: (): IRepoRegistration[] =>
      rows.map(row => ({
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
