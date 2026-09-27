import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { makeAggregateSessionLockKey } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLockKey';
import type { IAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import type { IAggregateId } from '@zerospin/core/models/types';
import { makeZerospinError } from '@zerospin/error';
import { Effect } from 'effect';
import { isEqual } from 'es-toolkit';

export const checkAggregateAuthorization = Effect.fn(
  'AggregateAccessApi.checkAggregateAuthorization',
)(function* (props: {
  authorization: Readonly<{
    aggregateId: IAggregateId;
    aggregateName: string;
    aggregateVersion: string;
    claims: Readonly<Record<string, unknown>>;
    aggregateSessionLock: IAggregateSessionLock;
    sessionSpec: IAggregateSessionSpec;
  }>;
  claims: Readonly<Record<string, unknown>>;
  aggregateId: IAggregateId;
  aggregateName: string;
  aggregateVersion: string;
  sessionName: string;
  aggregateSessionLock: IAggregateSessionLock;
}) {
  const {
    authorization,
    claims,
    aggregateId,
    aggregateName,
    sessionName,
    aggregateSessionLock,
    aggregateVersion,
  } = props;

  // 2 — compute submitted and authorized aggregate definition lock keys
  const submittedLockKey =
    yield* makeAggregateSessionLockKey(aggregateSessionLock);
  const authorizedLockKey = yield* makeAggregateSessionLockKey(
    authorization.aggregateSessionLock,
  );

  // 3 — compare aggregateId, aggregateName, claims, sessionName, and lock
  if (
    authorization.aggregateId !== aggregateId ||
    authorization.aggregateName !== aggregateName ||
    authorization.aggregateVersion !== aggregateVersion ||
    authorization.sessionSpec.aggregateVersion !== aggregateVersion ||
    !isEqual(authorization.claims, claims) ||
    authorization.sessionSpec.aggregateName !== aggregateName ||
    authorization.sessionSpec.sessionName !== sessionName ||
    authorizedLockKey !== submittedLockKey
  ) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'aggregate-session-admission-target-mismatch',
        message:
          'SystemWorker returned an aggregate definition authorization for a different target or lock',
      }),
    );
  }
});
