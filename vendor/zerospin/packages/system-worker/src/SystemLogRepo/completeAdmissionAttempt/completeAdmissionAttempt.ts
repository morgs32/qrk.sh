import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { systemLogRepoDbConfig } from '../systemLogRepoDbConfig.js';

/** A successful admission is withheld until its terminal audit record is durable. */
export const completeAdmissionAttempt = Effect.fn(
  'SystemLogRepo.completeAdmissionAttempt',
)(function* (props: {
  db: IDb;
  attemptId: `aat_${string}`;
  result:
    | {
        status: 'succeeded';
        claims: Readonly<Record<string, unknown>>;
        claimsHash: string;
        selection: Readonly<Record<string, string>>;
        actorPath: string;
      }
    | { status: 'failed'; failure: { code: string; message: string } };
}) {
  const table = systemLogRepoDbConfig.schema.admissionAttempts;
  const rows = yield* Effect.try({
    try: () =>
      props.db
        .update(table)
        .set({
          completedAt: new Date(),
          status: props.result.status,
          ...(props.result.status === 'succeeded'
            ? {
                claims: JSON.stringify(props.result.claims),
                claimsHash: props.result.claimsHash,
                selection: JSON.stringify(props.result.selection),
                actorPath: props.result.actorPath,
                failure: null,
              }
            : { failure: JSON.stringify(props.result.failure) }),
        })
        .where(
          and(
            eq(table.attemptId, props.attemptId),
            eq(table.status, 'unfinished'),
          ),
        )
        .returning({ attemptId: table.attemptId })
        .all(),
    catch: () =>
      makeZerospinError({
        code: 'admission-attempt-write-failed',
        message: 'Could not complete admission attempt',
      }),
  });
  if (rows.length !== 1) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'admission-attempt-not-unfinished',
        message: 'Admission attempt does not exist or is already complete',
      }),
    );
  }
});
