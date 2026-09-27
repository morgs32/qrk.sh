import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import type { ISystem } from '@zerospin/core/system/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { ServiceAccessApi } from '../../ServiceAccessApi/ServiceAccessApi.js';
import { ServiceAccessApiFailure } from '../../ServiceAccessApi/ServiceAccessApiFailure/ServiceAccessApiFailure.js';

import { admitService } from './admitService/admitService.js';

export const admit = Effect.fn('ServiceApi.admit')(function* (props: {
  request: IAdmissionRequest & { actorName: string; actorVersion: string };
  binding: {
    systemName: string;
    serviceName: string;
    serviceVersion: string;
  };
  runtime: ISystem['runtime'];
}) {
  return yield* Effect.gen(function* () {
    const request = yield* Schema.decodeUnknownEffect(
      Schema.Union([
        Schema.Struct({
          identity: Schema.Unknown,
          actorName: Schema.String,
          actorVersion: Schema.String,
        }),
        Schema.Struct({
          credentials: Schema.Unknown,
          actorName: Schema.String,
          actorVersion: Schema.String,
        }),
      ]),
    )(props.request, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'service-identity-arguments-invalid',
        prefix: 'Invalid service identity arguments',
      }),
    );
    const admitted = yield* admitService({
      ...props.binding,
      request:
        'identity' in request
          ? { identity: request.identity }
          : { credentials: request.credentials },
      actorName: request.actorName,
      actorVersion: request.actorVersion,
    });
    return new ServiceAccessApi({
      access: {
        ...props.binding,
        actorName: request.actorName,
        actorVersion: request.actorVersion,
        admitted,
      },
      runtime: props.runtime,
    });
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(new ServiceAccessApiFailure(makeZerospinError(error))),
    ),
  );
});
