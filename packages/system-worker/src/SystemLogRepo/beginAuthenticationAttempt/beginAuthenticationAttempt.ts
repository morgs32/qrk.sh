import type { IDb } from '@zerospin/core/drizzle/types';
import { ZerospinError } from '@zerospin/error';
import { makeIdFromAbbreviation } from '@zerospin/schema';
import { Effect } from 'effect';

import { systemLogRepoDbConfig } from '../systemLogRepoDbConfig.js';

/** Persist an unfinished attempt before any signature validation or authored authentication. */
export const beginAuthenticationAttempt = Effect.fn(
  'SystemLogRepo.beginAuthenticationAttempt',
)(function* (props: {
  db: IDb;
  ownerKind: 'aggregate' | 'service';
  ownerName: string;
  ownerVersion: string;
}) {
  const attemptId = yield* makeIdFromAbbreviation({ abbreviation: 'aat' });
  yield* Effect.try({
    try: () =>
      props.db
        .insert(systemLogRepoDbConfig.schema.authenticationAttempts)
        .values({
          attemptId,
          ownerKind: props.ownerKind,
          ownerName: props.ownerName,
          ownerVersion: props.ownerVersion,
          startedAt: new Date(),
          completedAt: null,
          status: 'unfinished',
          authentication: null,
          authenticationHash: null,
          selection: null,
          selectionPath: null,
          failure: null,
        })
        .run(),
    catch: () =>
      new ZerospinError({
        code: 'authentication-attempt-write-failed',
        message: 'Could not persist authentication attempt',
      }),
  });
  return { attemptId };
});
