import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { Effect } from 'effect';

import { MaterializedAggregateRepo } from '../../MaterializedAggregateRepo/MaterializedAggregateRepo.js';
import { ServiceCommandChain } from '../../ServiceCommandChain/ServiceCommandChain.js';
import { aggregateCommandChainDrizzleSchemas } from '../AggregateCommandChainDbConfig.js';

export const subscribeService = Effect.fn(
  'AggregateCommandChain.subscribeService',
)(function* (props: {
  aggregateCommandChainName: string;
  aggregateId: string;
  aggregateName: string;
  currentServiceIndex: number | null;
  db: IDb;
  serviceCommandChains: Cloudflare.Env['SERVICE_COMMAND_CHAIN'];
  serviceName: string;
  systemId: string;
}) {
  const materializedAggregateRepoName =
    yield* MaterializedAggregateRepo.fixedDORepoConfig.nameUtils.makeName({
      systemId: props.systemId,
      aggregateId: props.aggregateId,
      aggregateName: props.aggregateName,
    });
  props.db
    .insert(aggregateCommandChainDrizzleSchemas.serviceSubscriptions)
    .values({
      serviceName: props.serviceName,
      serviceIndex: props.currentServiceIndex,
      materializedAggregateRepoName,
      lastDeliveryFailure: null,
    })
    .onConflictDoUpdate({
      target:
        aggregateCommandChainDrizzleSchemas.serviceSubscriptions.serviceName,
      set: {
        serviceIndex: props.currentServiceIndex,
        materializedAggregateRepoName,
        lastDeliveryFailure: null,
      },
    })
    .run();

  const serviceCommandChainName =
    yield* ServiceCommandChain.fixedDORepoConfig.nameUtils.makeName({
      systemId: props.systemId,
      serviceName: props.serviceName,
    });
  yield* makeAsync<IEncodedResult<void, IAnyErrorJson>, IAnyError>(
    () =>
      props.serviceCommandChains
        .getByName(serviceCommandChainName)
        .subscribeAggregate({
          aggregateCommandChainName: props.aggregateCommandChainName,
          aggregateId: props.aggregateId,
          aggregateName: props.aggregateName,
          currentServiceIndex: props.currentServiceIndex,
        }),
    ZerospinError.catch({
      code: 'aggregate-command-chain-service-subscription-rpc-failed',
      message: `Failed to subscribe to service ${props.serviceName}`,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
});
