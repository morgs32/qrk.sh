/*
 * Resolves one actor-specific canonical service projection and down-adapts its
 * resources to the exact frontend selection selected during admission.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { ServiceFrontendStateSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { getServiceFrontendRepo } from '../ServiceFrontendRepo/getServiceFrontendRepo/getServiceFrontendRepo.js';
import { adaptFrontendResource } from '../StaticSystem/adaptFrontendResource/adaptFrontendResource.js';
import { SelectedServiceFrontendLockSchema } from '../StaticSystem/frontendSpecSchemas.js';
import { validateServiceFrontendLock } from '../StaticSystem/validateServiceFrontendLock/validateServiceFrontendLock.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const getServiceFrontendState = Effect.fn(
  'SystemWorker.getServiceFrontendState',
  { root: true },
)(function* (props: {
  generationId: string;
  serviceName: string;
  userId: string;
  frontendName: string;
  serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
}): Effect.fn.Return<IServiceFrontendState, IAnyError, Async> {
  const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
    props.userId,
  ).pipe(
    mapParseError({
      code: 'service-frontend-state-user-id-invalid',
      prefix: 'Failed to decode service frontend state userId',
    }),
  );

  const generationId = props.generationId;
  const selectedUnknown = yield* validateServiceFrontendLock({
    serviceName: props.serviceName,
    frontendName: props.frontendName,
    serviceFrontendLock: props.serviceFrontendLock,
  });
  const selected = yield* Schema.decodeUnknown(
    SelectedServiceFrontendLockSchema,
  )(selectedUnknown, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-runtime-service-frontend-lock-invalid',
      prefix: 'The static System returned an invalid selected lock',
    }),
  );
  const systemRepo = SystemRepo.getRepo({
    systemId: env.ZEROSPIN_SYSTEM_ID,
  });
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
        kind: 'service',
        serviceName: props.serviceName,
        userId,
        frontendName: props.frontendName,
      },
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  const serviceFrontendRepo = yield* getServiceFrontendRepo({
    key: {
      generationId,
      serviceName: props.serviceName,
      userId,
      frontendName: props.frontendName,
    },
  });
  const canonicalStateUnknown = yield* makeAsync(() =>
    serviceFrontendRepo.getState({
      systemId: env.ZEROSPIN_SYSTEM_ID,
      serviceName: props.serviceName,
      userId,
      frontendName: props.frontendName,
      lineage,
    }),
  );
  const canonicalStateEncoded = yield* Schema.decodeUnknown(
    Schema.Union(
      Schema.Struct({
        _tag: Schema.Literal('Right'),
        right: Schema.typeSchema(ServiceFrontendStateSchema),
      }),
      Schema.Struct({
        _tag: Schema.Literal('Left'),
        left: Schema.encodedSchema(ZerospinError.schema),
      }),
    ),
  )(canonicalStateUnknown).pipe(
    mapParseError({
      code: 'service-frontend-state-rpc-invalid',
      prefix: 'Failed to decode ServiceFrontendRepo state RPC',
    }),
  );
  const canonicalState = yield* decodeRpc(canonicalStateEncoded);

  const resources: IServiceFrontendState['resources'][number][] = [];
  for (const resource of canonicalState.resources) {
    const requestedModel = Object.values(
      selected.serviceFrontendLock.models,
    ).find(model => model.modelName === resource.modelName);
    if (requestedModel === undefined) {
      continue;
    }
    const adaptedUnknown = yield* adaptFrontendResource({
      owner: { kind: 'service', serviceName: props.serviceName },
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
        code: 'service-frontend-resource-adaptation-result-invalid',
        prefix:
          'The static System returned an invalid adapted service frontend resource',
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
