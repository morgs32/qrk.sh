import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import type { IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, type Schema } from 'effect';
import { system } from 'system';

import { getMaterializedServiceRepo } from '../MaterializedServiceRepo/getMaterializedServiceRepo/getMaterializedServiceRepo.js';

export const executeAggregateQuery = Effect.fn(
  'SystemWorker.executeAggregateQuery',
  { root: true },
)(function* (props: {
  aggregateId: IAggregateId;
  aggregateName: string;
  userId: string;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
  queryName: string;
  params: unknown;
}) {
  const { aggregateName, params, queryName } = props;
  const aggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: aggregateName,
    recordKind: 'aggregates',
  });
  const query = yield* getByKeyOrThrow({
    record: aggregate.queries,
    key: queryName,
    recordKind: `queries granted by aggregate ${aggregateName}`,
  });
  const serviceRepo = yield* getMaterializedServiceRepo({
    key: {
      systemId: env.ZEROSPIN_SYSTEM_ID,
      serviceName: query.serviceName,
    },
  });
  return yield* makeAsync<IEncodedResult<unknown, IAnyErrorJson>>(() =>
    serviceRepo.executeServiceQuery({
      queryName: queryName,
      serviceName: query.serviceName,
      params: params,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
});
