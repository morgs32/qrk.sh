import { type AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
import { type ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { makeServiceFrontendLockKey } from '@zerospin/core/frontendController/makeServiceFrontendLockKey';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import type { IAggregateId } from '@zerospin/core/models/types';
import { ZerospinError } from '@zerospin/error';
import { Effect, type Schema } from 'effect';
import { isEqual } from 'es-toolkit';

/*
 * Gateway admission verifies that an owner authorization answers the exact
 * frontend request. Authentication supplies authentication; the caller supplies owner
 * and frontend fields, which are compared with the authorization result.
 *
 * 1. Select the owner-specific comparison.
 * 2. Canonicalize the aggregate locks.
 * 3. Check the aggregate authorization.
 * 4. Canonicalize the service locks.
 * 5. Check the service authorization.
 */
export const checkAuthorization = Effect.fn('GatewayApi.checkAuthorization')(
  function* (
    props:
      | {
          kind: 'aggregate';
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
          aggregateFrontendLock: Schema.Schema.Type<
            typeof AggregateFrontendLockSchema
          >;
        }
      | {
          kind: 'service';
          authorization: Readonly<{
            authentication: Readonly<Record<string, unknown>>;
            serviceFrontendLock: Schema.Schema.Type<
              typeof ServiceFrontendLockSchema
            >;
            frontendSpec: IFrontendControllerSpec;
          }>;
          authentication: Readonly<Record<string, unknown>>;
          systemName: string;
          serviceName: string;
          serviceVersion: string;
          frontendName: string;
          serviceFrontendLock: Schema.Schema.Type<
            typeof ServiceFrontendLockSchema
          >;
        },
  ) {
    // 1 — use the aggregate or service lock and target fields
    const { kind } = props;
    if (kind === 'aggregate') {
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

      // 3 — compare kind, aggregateId, aggregateName, authentication, systemName, frontendName, and lock
      if (
        authorization.frontendSpec.kind !== 'aggregate' ||
        authorization.aggregateId !== aggregateId ||
        authorization.aggregateName !== aggregateName ||
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
      return;
    }
    const {
      authorization,
      authentication,
      systemName,
      serviceName,
      frontendName,
      serviceFrontendLock,
    } = props;

    // 4 — compute submitted and authorized service frontend lock keys
    const submittedLockKey =
      yield* makeServiceFrontendLockKey(serviceFrontendLock);
    const authorizedLockKey = yield* makeServiceFrontendLockKey(
      authorization.serviceFrontendLock,
    );

    // 5 — compare authentication, kind, systemName, serviceName, frontendName, and lock
    if (
      !isEqual(authorization.authentication, authentication) ||
      authorization.frontendSpec.kind !== 'service' ||
      authorization.frontendSpec.systemName !== systemName ||
      authorization.frontendSpec.serviceName !== serviceName ||
      authorization.frontendSpec.name !== frontendName ||
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
