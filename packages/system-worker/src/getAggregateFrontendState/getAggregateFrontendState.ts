import type { IUserRef } from '@zerospin/core/aggregate/types';
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { AggregateFrontendSyncStateSchema } from '@zerospin/core/session/AggregateFrontendBlockSchema';
import type { IAggregateFrontendSyncState } from '@zerospin/core/session/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { getAggregateFrontendRepo } from '../AggregateFrontendRepo/getAggregateFrontendRepo/getAggregateFrontendRepo.js';
import { adaptFrontendResource } from '../StaticSystem/adaptFrontendResource/adaptFrontendResource.js';
import { SelectedAggregateFrontendLockSchema } from '../StaticSystem/frontendSpecSchemas.js';
import { validateAggregateFrontendLock } from '../StaticSystem/validateAggregateFrontendLock/validateAggregateFrontendLock.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const getAggregateFrontendState = Effect.fn(
  'SystemWorker.getAggregateFrontendState',
  {
    root: true,
  },
)(function* (props: {
  generationId: string;
  actorRef: IUserRef;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
}): Effect.fn.Return<IAggregateFrontendSyncState, IAnyError, Async> {
  const aggregateId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.aggregate),
  )(props.actorRef.aggregateId).pipe(
    mapParseError({
      code: 'aggregate-frontend-state-aggregate-id-invalid',
      prefix: 'Failed to decode frontend state aggregateId',
    }),
  );
  const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
    props.actorRef.userId,
  ).pipe(
    mapParseError({
      code: 'aggregate-frontend-state-user-id-invalid',
      prefix: 'Failed to decode frontend state userId',
    }),
  );
  const generationId = props.generationId;
  const selectedUnknown = yield* validateAggregateFrontendLock({
    aggregateName: props.actorRef.aggregateName,
    frontendName: props.frontendName,
    aggregateFrontendLock: props.aggregateFrontendLock,
  });
  const selected = yield* Schema.decodeUnknown(
    SelectedAggregateFrontendLockSchema,
  )(selectedUnknown, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-runtime-aggregate-frontend-lock-invalid',
      prefix:
        'The static System returned an invalid selected aggregate frontend lock',
    }),
  );
  const systemRepo = SystemRepo.getRepo({ systemId: env.ZEROSPIN_SYSTEM_ID });
  yield* makeAsync(() =>
    systemRepo.assertGenerationAdmission({
      generationId,
      mode: 'read',
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  const lineage = yield* makeAsync(() =>
    systemRepo.resolveFrontendProjectionLineage({
      generationId,
      target: {
        kind: 'aggregate',
        aggregateId,
        aggregateName: props.actorRef.aggregateName,
        userId,
        frontendName: props.frontendName,
      },
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  const aggregateFrontendRepo = yield* getAggregateFrontendRepo({
    key: {
      generationId,
      aggregateId,
      aggregateName: props.actorRef.aggregateName,
      userId,
      frontendName: props.frontendName,
    },
  });
  const canonicalStateUnknown = yield* makeAsync(() =>
    aggregateFrontendRepo.getState({
      aggregateId,
      aggregateName: props.actorRef.aggregateName,
      userId,
      frontendName: props.frontendName,
      lineage,
    }),
  );
  const canonicalStateEncoded = yield* Schema.decodeUnknown(
    Schema.Union(
      Schema.Struct({
        _tag: Schema.Literal('Right'),
        right: Schema.typeSchema(AggregateFrontendSyncStateSchema),
      }),
      Schema.Struct({
        _tag: Schema.Literal('Left'),
        left: Schema.encodedSchema(ZerospinError.schema),
      }),
    ),
  )(canonicalStateUnknown).pipe(
    mapParseError({
      code: 'aggregate-frontend-state-rpc-invalid',
      prefix: 'Failed to decode AggregateFrontendRepo state RPC',
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
        aggregateName: props.actorRef.aggregateName,
      },
      frontendName: props.frontendName,
      modelName: resource.modelName,
      modelVersion: requestedModel.version,
      resource,
    });
    const adapted = yield* Schema.decodeUnknown(
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
