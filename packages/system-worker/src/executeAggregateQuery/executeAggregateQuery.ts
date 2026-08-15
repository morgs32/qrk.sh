import type { IUserRef } from '@zerospin/core/aggregate/types';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { env } from 'cloudflare:workers';
import { Effect, type Schema } from 'effect';
import { system } from 'system';

import { getServiceRepo } from '../ServiceRepo/getServiceRepo/getServiceRepo.js';
import { validateAggregateFrontendLock } from '../StaticSystem/validateAggregateFrontendLock/validateAggregateFrontendLock.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const executeAggregateQuery = Effect.fn(
  'SystemWorker.executeAggregateQuery',
  { root: true },
)(function* (props: {
  generationId: string;
  actorRef: IUserRef;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
  queryName: string;
  params: unknown;
}) {
  yield* validateAggregateFrontendLock({
    aggregateName: props.actorRef.aggregateName,
    frontendName: props.frontendName,
    aggregateFrontendLock: props.aggregateFrontendLock,
  });
  const aggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: props.actorRef.aggregateName,
    recordKind: 'aggregates',
  });
  const query = yield* getByKeyOrThrow({
    record: aggregate.queries,
    key: props.queryName,
    recordKind: `queries granted by aggregate ${props.actorRef.aggregateName}`,
  });
  yield* makeAsync(() =>
    SystemRepo.getRepo({
      systemId: env.ZEROSPIN_SYSTEM_ID,
    }).assertGenerationAdmission({
      generationId: props.generationId,
      mode: 'read',
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  const serviceRepo = yield* getServiceRepo({
    key: {
      generationId: props.generationId,
      serviceName: query.serviceName,
    },
  });
  return yield* makeAsync(() =>
    serviceRepo.executeServiceQuery({
      queryName: props.queryName,
      serviceName: query.serviceName,
      params: props.params,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
});
