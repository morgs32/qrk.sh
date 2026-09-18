import { type AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import { ZerospinError } from '@zerospin/error';
import { Effect, type Schema } from 'effect';
import { isEqual } from 'es-toolkit';

export const checkAggregateAuthorization = Effect.fn(
  'GatewayApi.checkAggregateAuthorization',
)(function* (props: {
  authorization: Readonly<{
    aggregateId: IAggregateId;
    aggregateName: string;
    aggregateVersion: string;
    authentication: Readonly<Record<string, unknown>>;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
    frontendSpec: IFrontendControllerSpec;
  }>;
  authentication: Readonly<Record<string, unknown>>;
  aggregateId: IAggregateId;
  aggregateName: string;
  aggregateVersion: string;
  systemName: string;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
}) {
  const {
    authorization,
    authentication,
    aggregateId,
    aggregateName,
    systemName,
    frontendName,
    aggregateFrontendLock,
  } = props;

  // 2 — compute submitted and authorized aggregate frontend lock keys
  const submittedLockKey = yield* makeAggregateFrontendLockKey(
    aggregateFrontendLock,
  );
  const authorizedLockKey = yield* makeAggregateFrontendLockKey(
    authorization.aggregateFrontendLock,
  );

  // 3 — compare aggregateId, aggregateName, authentication, systemName, frontendName, and lock
  if (
    authorization.frontendSpec.kind !== 'aggregate' ||
    authorization.aggregateId !== aggregateId ||
    authorization.aggregateName !== aggregateName ||
    authorization.aggregateVersion !== props.aggregateVersion ||
    authorization.frontendSpec.aggregateVersion !== props.aggregateVersion ||
    !isEqual(authorization.authentication, authentication) ||
    authorization.frontendSpec.systemName !== systemName ||
    authorization.frontendSpec.aggregateName !== aggregateName ||
    authorization.frontendSpec.name !== frontendName ||
    authorizedLockKey !== submittedLockKey
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-admission-target-mismatch',
      message:
        'SystemWorker returned an aggregate frontend authorization for a different target or lock',
    });
  }
});
