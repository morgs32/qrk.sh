import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { makeServiceFrontendLockKey } from '@zerospin/core/frontendController/makeServiceFrontendLockKey';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import { ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

export const checkAuthorization = Effect.fn('GatewayApi.checkAuthorization')(
  function* (
    props:
      | {
          kind: 'aggregate';
          authorization: Readonly<{
            aggregateId: IAggregateId;
            aggregateName: string;
            userId: string;
            aggregateFrontendLock: Schema.Schema.Type<
              typeof AggregateFrontendLockSchema
            >;
            frontendSpec: IFrontendControllerSpec;
          }>;
          userId: string;
          aggregateId: IAggregateId;
          aggregateName: string;
          systemName: string;
          frontendName: string;
          aggregateFrontendLock: Schema.Schema.Type<
            typeof AggregateFrontendLockSchema
          >;
        }
      | {
          kind: 'service';
          authorization: Readonly<{
            userId: string;
            serviceFrontendLock: Schema.Schema.Type<
              typeof ServiceFrontendLockSchema
            >;
            frontendSpec: IFrontendControllerSpec;
          }>;
          userId: string;
          systemName: string;
          serviceName: string;
          frontendName: string;
          serviceFrontendLock: Schema.Schema.Type<
            typeof ServiceFrontendLockSchema
          >;
        },
  ) {
    if (props.kind === 'aggregate') {
      const {
        authorization,
        userId,
        aggregateId,
        aggregateName,
        systemName,
        frontendName,
        aggregateFrontendLock,
      } = props;
      const submittedLockKey = yield* makeAggregateFrontendLockKey(
        aggregateFrontendLock,
      );
      const authorizedLockKey = yield* makeAggregateFrontendLockKey(
        authorization.aggregateFrontendLock,
      );
      if (
        authorization.frontendSpec.kind !== 'aggregate' ||
        authorization.aggregateId !== aggregateId ||
        authorization.aggregateName !== aggregateName ||
        authorization.userId !== userId ||
        authorization.frontendSpec.systemName !== systemName ||
        authorization.frontendSpec.aggregateName !== aggregateName ||
        authorization.frontendSpec.frontendName !== frontendName ||
        authorizedLockKey !== submittedLockKey
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-admission-target-mismatch',
          message:
            'SystemWorker returned an aggregate frontend authorization for a different target or lock',
        });
      }
      return;
    }
    const {
      authorization,
      userId,
      systemName,
      serviceName,
      frontendName,
      serviceFrontendLock,
    } = props;
    const submittedLockKey =
      yield* makeServiceFrontendLockKey(serviceFrontendLock);
    const authorizedLockKey = yield* makeServiceFrontendLockKey(
      authorization.serviceFrontendLock,
    );
    if (
      authorization.userId !== userId ||
      authorization.frontendSpec.kind !== 'service' ||
      authorization.frontendSpec.systemName !== systemName ||
      authorization.frontendSpec.serviceName !== serviceName ||
      authorization.frontendSpec.frontendName !== frontendName ||
      authorizedLockKey !== submittedLockKey
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-admission-target-mismatch',
        message:
          'SystemWorker returned a service frontend authorization for a different target or lock',
      });
    }
  },
);
