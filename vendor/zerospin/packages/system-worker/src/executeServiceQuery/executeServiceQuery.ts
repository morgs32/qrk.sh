import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, type Schema } from 'effect';

import { getMaterializedServiceRepo } from '../MaterializedServiceRepo/getMaterializedServiceRepo/getMaterializedServiceRepo.js';

export const executeServiceQuery = Effect.fn(
  'SystemWorker.executeServiceQuery',
  { root: true },
)(function* (props: {
  aggregateId?: IAggregateId;
  aggregateName?: string;
  userId?: string;
  frontendName?: string;
  aggregateFrontendLock?: Schema.Schema.Type<
    typeof AggregateFrontendLockSchema
  >;
  serviceName: string;
  queryName: string;
  params: unknown;
}) {
  const {
    aggregateFrontendLock,
    aggregateId,
    aggregateName,
    frontendName,
    params,
    queryName,
    serviceName,
    userId,
  } = props;
  const hasAnyFrontendBinding =
    aggregateId !== undefined ||
    aggregateName !== undefined ||
    userId !== undefined ||
    frontendName !== undefined ||
    aggregateFrontendLock !== undefined;
  if (
    hasAnyFrontendBinding &&
    (aggregateId === undefined ||
      aggregateName === undefined ||
      userId === undefined ||
      frontendName === undefined ||
      aggregateFrontendLock === undefined)
  ) {
    return yield* new ZerospinError({
      code: 'service-query-frontend-binding-incomplete',
      message:
        'A frontend-bound service query requires aggregateId, aggregateName, userId, frontendName, and aggregateFrontendLock together',
    });
  }
  const serviceRepo = yield* getMaterializedServiceRepo({
    key: {
      systemId: env.ZEROSPIN_SYSTEM_ID,
      serviceName: serviceName,
    },
  });
  return yield* makeAsync<IEncodedResult<unknown, IAnyErrorJson>>(() =>
    serviceRepo.executeServiceQuery({
      serviceName: serviceName,
      queryName: queryName,
      params: params,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
});
