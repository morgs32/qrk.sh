/*
 * System-worker annotation:
 * Implements the ServiceRepo execute Service Query operation.
 * Keep the domain effect named after the operation and leave async Promise glue at the Durable Object boundary.
 */

import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { system } from 'system';

export const executeServiceQuery = Effect.fn('ServiceRepo.executeServiceQuery')(
  function* (props: {
    serviceName: string;
    queryName: string;
    params: unknown;
    db: IDb;
  }) {
    const { serviceName, queryName, params, db } = props;
    const serviceController = system.serviceControllers[serviceName];

    if (serviceController === undefined) {
      return yield* new ZerospinError({
        code: 'service-not-found',
        message: `Service ${serviceName} was not found`,
        extra: { serviceName },
      });
    }

    const serviceQuery = serviceController.queries[queryName];

    if (serviceQuery === undefined) {
      return yield* new ZerospinError({
        code: 'service-query-not-found',
        message: `Service query ${serviceName}.${queryName} was not found`,
        extra: { serviceName, queryName },
      });
    }

    const decodedParams = yield* Schema.validate(serviceQuery.paramsSchema)(
      params,
      { onExcessProperty: 'ignore' },
    ).pipe(
      mapParseError({
        code: 'failed-to-decode-service-query-params',
        prefix: `Failed to decode params for ${serviceName}.${queryName}`,
        extra: { serviceName, queryName },
      }),
    );
    return yield* serviceQuery.query({
      db,
      params: decodedParams,
    } as never);
  },
);
