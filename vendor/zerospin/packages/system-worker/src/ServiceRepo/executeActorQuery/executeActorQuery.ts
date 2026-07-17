/*
 * System-worker annotation:
 * Implements the ServiceRepo execute Actor Query operation.
 * Keep the actor-api lookup explicit here; do not share the direct service-query runner until the duplicated shape is approved.
 */

import type { IAnyActorApi } from '@zerospin/core/actorController/types';
import type { IDb } from '@zerospin/core/drizzle/types';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { system } from 'system';

export const executeActorQuery = Effect.fn('ServiceRepo.executeActorQuery')(
  function* (props: {
    accountName: string;
    actorId: string;
    actorName: string;
    db: IDb;
    params: unknown;
    queryName: string;
    serviceName: string;
    frontendName: string;
  }) {
    const {
      accountName,
      actorId,
      actorName,
      db,
      params,
      queryName,
      serviceName,
      frontendName,
    } = props;

    const accountController = yield* getByKeyOrThrow({
      record: system.accountControllers,
      key: accountName,
      recordKind: 'accountControllers',
    });
    const actorController = yield* getByKeyOrThrow({
      record: accountController.actorControllers,
      key: actorName,
      recordKind: 'actorControllers',
    });

    if (Object.keys(actorController.api).length === 0) {
      return yield* new ZerospinError({
        code: 'actor-api-not-configured',
        message: `Actor ${accountName}.${actorName} does not configure an actor API`,
        extra: { accountName, actorId, actorName, queryName, frontendName },
      });
    }

    const actorApi: IAnyActorApi = actorController.api;
    const serviceQuery = yield* getByKeyOrThrow({
      record: actorApi,
      key: queryName,
      recordKind: 'actor-query',
    });

    if (serviceQuery.serviceName !== serviceName) {
      return yield* new ZerospinError({
        code: 'actor-query-service-mismatch',
        message: `Actor query ${accountName}.${actorName}.${queryName} belongs to service ${serviceQuery.serviceName}, not ${serviceName}`,
        extra: {
          accountName,
          actorId,
          actorName,
          expectedServiceName: serviceName,
          queryName,
          serviceName: serviceQuery.serviceName,
          frontendName,
        },
      });
    }

    const decodedParams = yield* Schema.validate(serviceQuery.paramsSchema)(
      params,
      { onExcessProperty: 'ignore' },
    ).pipe(
      mapParseError({
        code: 'failed-to-decode-actor-query-params',
        prefix: `Failed to decode params for ${accountName}.${actorName}.${queryName}`,
        extra: { accountName, actorId, actorName, queryName, frontendName },
      }),
    );

    return yield* serviceQuery.query({
      db,
      params: decodedParams,
    } as never);
  },
);
