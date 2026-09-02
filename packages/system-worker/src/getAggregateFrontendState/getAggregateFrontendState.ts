import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import type { IAggregateId } from '@zerospin/core/models/types';
import { AggregateFrontendSyncStateSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import type { IAggregateFrontendSyncState } from '@zerospin/core/session/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { getMaterializedAggregateFrontendRepo } from '../MaterializedAggregateFrontendRepo/getMaterializedAggregateFrontendRepo/getMaterializedAggregateFrontendRepo.js';
import { adaptFrontendResource } from '../StaticSystem/adaptFrontendResource/adaptFrontendResource.js';
import { SelectedAggregateFrontendLockSchema } from '../StaticSystem/frontendSpecSchemas.js';
import { validateAggregateFrontendLock } from '../StaticSystem/validateAggregateFrontendLock/validateAggregateFrontendLock.js';

export const getAggregateFrontendState = Effect.fn(
  'SystemWorker.getAggregateFrontendState',
  {
    root: true,
  },
)(function* (props: {
  aggregateId: IAggregateId;
  aggregateName: string;
  userId: string;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
}): Effect.fn.Return<IAggregateFrontendSyncState, IAnyError, Async> {
  const {
    aggregateFrontendLock,
    aggregateId,
    aggregateName,
    frontendName,
    userId,
  } = props;
  const selectedUnknown = yield* validateAggregateFrontendLock({
    aggregateName: aggregateName,
    frontendName: frontendName,
    aggregateFrontendLock: aggregateFrontendLock,
  });
  const selected = yield* Schema.decodeUnknownEffect(
    SelectedAggregateFrontendLockSchema,
  )(selectedUnknown, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-runtime-aggregate-frontend-lock-invalid',
      prefix:
        'The static System returned an invalid selected aggregate frontend lock',
    }),
  );
  const aggregateFrontendRepo = yield* getMaterializedAggregateFrontendRepo({
    key: {
      systemId: env.ZEROSPIN_SYSTEM_ID,
      aggregateId,
      aggregateName: aggregateName,
      userId,
      frontendName: frontendName,
    },
  });
  const canonicalStateUnknown = yield* makeAsync(() =>
    aggregateFrontendRepo.getState({
      aggregateId,
      aggregateName: aggregateName,
      userId,
      frontendName: frontendName,
    }),
  );
  const canonicalStateEncoded = yield* Schema.decodeUnknownEffect(
    Schema.Union([
      Schema.Struct({
        _tag: Schema.Literal('Success'),
        success: Schema.toType(AggregateFrontendSyncStateSchema),
      }),
      Schema.Struct({
        _tag: Schema.Literal('Failure'),
        failure: Schema.toEncoded(ZerospinError.schema),
      }),
    ]),
  )(canonicalStateUnknown).pipe(
    mapParseError({
      code: 'aggregate-frontend-state-rpc-invalid',
      prefix: 'Failed to decode MaterializedAggregateFrontendRepo state RPC',
    }),
  );
  const canonicalState = yield* decodeRpc(canonicalStateEncoded);
  const resources: IAggregateFrontendSyncState['resources'][number][] = [];
  for (const resource of canonicalState.resources) {
    const requestedModel = Object.values(
      selected.aggregateFrontendLock.models,
    ).find(model => model.modelName === resource.modelName);
    if (requestedModel === undefined) {
      continue;
    }
    const adaptedUnknown = yield* adaptFrontendResource({
      owner: {
        kind: 'aggregate',
        aggregateName: aggregateName,
      },
      frontendName: frontendName,
      modelName: resource.modelName,
      modelVersion: requestedModel.version,
      resource,
    });
    const adapted = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        modelName: Schema.String,
        resource: EncodedResourceSchema,
      }),
    )(adaptedUnknown, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'aggregate-frontend-resource-adaptation-result-invalid',
        prefix:
          'The static System returned an invalid adapted frontend resource',
      }),
    );
    resources.push(adapted.resource);
  }
  return {
    ...canonicalState,
    systemVersion: system.version,
    resources,
  };
});
