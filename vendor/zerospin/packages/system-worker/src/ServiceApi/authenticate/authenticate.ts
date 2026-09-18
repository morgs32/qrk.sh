import { mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { authenticateService } from '../../authenticateService/authenticateService.js';
import type { ISystemRuntime } from '../../makeSystemRuntime.js';
import { ServiceAccessApi } from '../../ServiceAccessApi/ServiceAccessApi.js';
import { ServiceAccessApiFailure } from '../../ServiceAccessApi/ServiceAccessApiFailure/ServiceAccessApiFailure.js';

export const authenticate = Effect.fn('ServiceApi.authenticate')(
  function* (props: {
    request: { signature: unknown };
    binding: {
      systemName: string;
      serviceName: string;
      serviceVersion: string;
    };
    runtime: ISystemRuntime;
  }) {
    return yield* Effect.gen(function* () {
      const request = yield* Schema.decodeUnknownEffect(
        Schema.Struct({ signature: Schema.Unknown }),
      )(props.request, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'service-authentication-arguments-invalid',
          prefix: 'Invalid service authentication arguments',
        }),
      );
      const authenticated = yield* authenticateService({
        ...props.binding,
        signature: request.signature,
      });
      return new ServiceAccessApi({
        access: { ...props.binding, authenticated },
        runtime: props.runtime,
      });
    }).pipe(
      Effect.catch(error => Effect.succeed(new ServiceAccessApiFailure(error))),
    );
  },
);
