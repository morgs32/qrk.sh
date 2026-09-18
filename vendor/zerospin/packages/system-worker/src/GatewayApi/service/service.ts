import { mapParseError, ZerospinError } from '@zerospin/error';
import config from 'config';
import { Effect, Schema } from 'effect';

import type { ISystemRuntime } from '../../makeSystemRuntime.js';
import { ServiceApi } from '../../ServiceApi/ServiceApi.js';
import { ServiceApiFailure } from '../../ServiceApi/ServiceApiFailure/ServiceApiFailure.js';
import { checkPublishableApiKey } from '../checkPublishableApiKey/checkPublishableApiKey.js';

/** Resolve one service version before issuing an authentication capability. */
export const service = Effect.fn('GatewayApi.service')(function* (props: {
  request: {
    publishableKey: string;
    systemName: string;
    name: string;
    version: string;
  };
  runtime: ISystemRuntime;
}) {
  return yield* Effect.gen(function* () {
    const request = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        publishableKey: Schema.String,
        systemName: Schema.String,
        name: Schema.String,
        version: Schema.String,
      }),
    )(props.request, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'service-api-arguments-invalid',
        prefix: 'Invalid service capability arguments',
      }),
    );
    yield* checkPublishableApiKey(request.publishableKey);
    if (request.systemName !== config.system.name) {
      return yield* new ZerospinError({
        code: 'authentication-system-name-mismatch',
        message: 'Requested system differs from the configured system',
      });
    }
    if (config.system.services[request.name]?.[request.version] === undefined) {
      return yield* new ZerospinError({
        code: 'authentication-service-unavailable',
        message: 'The requested service version is unavailable',
      });
    }
    return new ServiceApi({
      binding: {
        systemName: request.systemName,
        serviceName: request.name,
        serviceVersion: request.version,
      },
      runtime: props.runtime,
    });
  }).pipe(Effect.catch(error => Effect.succeed(new ServiceApiFailure(error))));
});
