import type { ISystem } from '@zerospin/core/system/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import config from 'config';
import { Effect, Schema } from 'effect';

import { AggregateApi } from '../../AggregateApi/AggregateApi.js';
import { AggregateApiFailure } from '../../AggregateApi/AggregateApiFailure/AggregateApiFailure.js';
import { checkPublishableApiKey } from '../checkPublishableApiKey/checkPublishableApiKey.js';

/** Resolve one aggregate version before issuing an identity capability. */
export const aggregate = Effect.fn('GatewayApi.aggregate')(function* (props: {
  request: {
    publishableKey: string;
    systemName: string;
    name: string;
    version: string;
    actorName: string;
    actorVersion: string;
  };
  runtime: ISystem['runtime'];
}) {
  return yield* Effect.gen(function* () {
    const request = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        publishableKey: Schema.String,
        systemName: Schema.String,
        name: Schema.String,
        version: Schema.String,
        actorName: Schema.String,
        actorVersion: Schema.String,
      }),
    )(props.request, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'aggregate-api-arguments-invalid',
        prefix: 'Invalid aggregate capability arguments',
      }),
    );
    yield* checkPublishableApiKey(request.publishableKey);
    if (request.systemName !== config.system.name) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'identity-system-name-mismatch',
          message: 'Requested system differs from the configured system',
        }),
      );
    }
    if (
      config.system.aggregates[request.name]?.[request.version] === undefined
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'identity-aggregate-unavailable',
          message: 'The requested aggregate version is unavailable',
        }),
      );
    }
    return new AggregateApi({
      binding: {
        systemName: request.systemName,
        aggregateName: request.name,
        aggregateVersion: request.version,
        actorName: request.actorName,
        actorVersion: request.actorVersion,
      },
      runtime: props.runtime,
    });
  }).pipe(
    Effect.catch(error => Effect.succeed(new AggregateApiFailure(error))),
  );
});
