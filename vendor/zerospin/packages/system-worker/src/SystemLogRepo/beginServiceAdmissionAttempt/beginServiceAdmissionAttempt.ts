import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { makeIdFromAbbreviation } from '@zerospin/schema';
import { Effect } from 'effect';

import { systemLogRepoDbConfig } from '../systemLogRepoDbConfig.js';

/** Persist an unfinished attempt before any credentials validation or authored claims. */
export const beginServiceAdmissionAttempt = Effect.fn(
  'SystemLogRepo.beginServiceAdmissionAttempt',
)(function* (props: { db: IDb; serviceName: string; serviceVersion: string }) {
  const attemptId = yield* makeIdFromAbbreviation({ abbreviation: 'aat' });
  yield* Effect.try({
    try: () =>
      props.db
        .insert(systemLogRepoDbConfig.schema.admissionAttempts)
        .values({
          attemptId,
          aggregateName: null,
          aggregateVersion: null,
          serviceName: props.serviceName,
          serviceVersion: props.serviceVersion,
          startedAt: new Date(),
          completedAt: null,
          status: 'unfinished',
          claims: null,
          claimsHash: null,
          selection: null,
          actorPath: null,
          failure: null,
        })
        .run(),
    catch: () =>
      makeZerospinError({
        code: 'admission-attempt-write-failed',
        message: 'Could not persist admission attempt',
      }),
  });
  return { attemptId };
});
