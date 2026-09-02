/*
 * Resolves one actor-specific canonical service projection and down-adapts its
 * resources to the exact frontend selection selected during admission.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { ServiceFrontendStateSchema } from '@zerospin/core/serviceSession/ServiceFrontendCommandSchema';
import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { getMaterializedServiceFrontendRepo } from '../MaterializedServiceFrontendRepo/getMaterializedServiceFrontendRepo/getMaterializedServiceFrontendRepo.js';
import { adaptFrontendResource } from '../StaticSystem/adaptFrontendResource/adaptFrontendResource.js';
import { SelectedServiceFrontendLockSchema } from '../StaticSystem/frontendSpecSchemas.js';
import { validateServiceFrontendLock } from '../StaticSystem/validateServiceFrontendLock/validateServiceFrontendLock.js';

export const getServiceFrontendState = Effect.fn(
  'SystemWorker.getServiceFrontendState',
  { root: true },
)(function* (props: {
  serviceName: string;
  userId: string;
  frontendName: string;
  serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
}): Effect.fn.Return<IServiceFrontendState, IAnyError, Async> {
  const { frontendName, serviceFrontendLock, serviceName, userId } = props;
  const selectedUnknown = yield* validateServiceFrontendLock({
    serviceName: serviceName,
    frontendName: frontendName,
    serviceFrontendLock: serviceFrontendLock,
  });
  const selected = yield* Schema.decodeUnknownEffect(
    SelectedServiceFrontendLockSchema,
  )(selectedUnknown, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-runtime-service-frontend-lock-invalid',
      prefix: 'The static System returned an invalid selected lock',
    }),
  );
  const serviceFrontendRepo = yield* getMaterializedServiceFrontendRepo({
    key: {
      systemId: env.ZEROSPIN_SYSTEM_ID,
      serviceName: serviceName,
      userId,
      frontendName: frontendName,
    },
  });
  const canonicalStateUnknown = yield* makeAsync(() =>
    serviceFrontendRepo.getState({
      systemId: env.ZEROSPIN_SYSTEM_ID,
      serviceName: serviceName,
      userId,
      frontendName: frontendName,
    }),
  );
  const canonicalStateEncoded = yield* Schema.decodeUnknownEffect(
    Schema.Union([
      Schema.Struct({
        _tag: Schema.Literal('Success'),
        success: Schema.toType(ServiceFrontendStateSchema),
      }),
      Schema.Struct({
        _tag: Schema.Literal('Failure'),
        failure: Schema.toEncoded(ZerospinError.schema),
      }),
    ]),
  )(canonicalStateUnknown).pipe(
    mapParseError({
      code: 'service-frontend-state-rpc-invalid',
      prefix: 'Failed to decode MaterializedServiceFrontendRepo state RPC',
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
      owner: { kind: 'service', serviceName: serviceName },
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
