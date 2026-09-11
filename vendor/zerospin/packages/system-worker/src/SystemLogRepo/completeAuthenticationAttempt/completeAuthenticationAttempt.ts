import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError } from '@zerospin/error';
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';

import { systemLogRepoDbConfig } from '../systemLogRepoDbConfig.js';

/** A successful admission is withheld until its terminal audit record is durable. */
export const completeAuthenticationAttempt = Effect.fn(
  'SystemLogRepo.completeAuthenticationAttempt',
)(function* (props: {
  db: IDb;
  attemptId: `aat_${string}`;
  result:
    | {
        status: 'succeeded';
        authentication: Readonly<Record<string, unknown>>;
        authenticationHash: string;
        selection: Readonly<Record<string, string>>;
        selectionPath: string;
      }
    | { status: 'failed'; failure: { code: string; message: string } };
}) {
  const table = systemLogRepoDbConfig.schema.authenticationAttempts;
  const rows = yield* Effect.try({
    try: () =>
      props.db
        .update(table)
        .set({
          completedAt: new Date(),
          status: props.result.status,
          ...(props.result.status === 'succeeded'
            ? {
                authentication: JSON.stringify(props.result.authentication),
                authenticationHash: props.result.authenticationHash,
                selection: JSON.stringify(props.result.selection),
                selectionPath: props.result.selectionPath,
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
      new ZerospinError({
        code: 'authentication-attempt-write-failed',
        message: 'Could not complete authentication attempt',
      }),
  });
  if (rows.length !== 1) {
    return yield* new ZerospinError({
      code: 'authentication-attempt-not-unfinished',
      message: 'Authentication attempt does not exist or is already complete',
    });
  }
});
