import { mapParseError, ZerospinError } from '@zerospin/error';
import config from 'config';
import { Effect, Schema } from 'effect';

import { AggregateApi } from '../../AggregateApi/AggregateApi.js';
import { AggregateApiFailure } from '../../AggregateApi/AggregateApiFailure/AggregateApiFailure.js';
import type { ISystemRuntime } from '../../makeSystemRuntime.js';
import { checkPublishableApiKey } from '../checkPublishableApiKey/checkPublishableApiKey.js';

/** Resolve one aggregate version before issuing an authentication capability. */
export const aggregate = Effect.fn('GatewayApi.aggregate')(function* (props: {
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
        code: 'aggregate-api-arguments-invalid',
        prefix: 'Invalid aggregate capability arguments',
      }),
    );
    yield* checkPublishableApiKey(request.publishableKey);
    if (request.systemName !== config.system.name) {
      return yield* new ZerospinError({
        code: 'authentication-system-name-mismatch',
        message: 'Requested system differs from the configured system',
      });
    }
    if (
      config.system.aggregates[request.name]?.[request.version] === undefined
    ) {
      return yield* new ZerospinError({
        code: 'authentication-aggregate-unavailable',
        message: 'The requested aggregate version is unavailable',
      });
    }
    return new AggregateApi({
      binding: {
        systemName: request.systemName,
        aggregateName: request.name,
        aggregateVersion: request.version,
      },
      runtime: props.runtime,
    });
  }).pipe(
    Effect.catch(error => Effect.succeed(new AggregateApiFailure(error))),
  );
});
