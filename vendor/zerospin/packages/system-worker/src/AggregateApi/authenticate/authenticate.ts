import { mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { AggregateAccessApi } from '../../AggregateAccessApi/AggregateAccessApi.js';
import { AggregateAccessApiFailure } from '../../AggregateAccessApi/AggregateAccessApiFailure/AggregateAccessApiFailure.js';
import { authenticateAggregate } from '../../authenticateAggregate/authenticateAggregate.js';
import type { ISystemRuntime } from '../../makeSystemRuntime.js';

export const authenticate = Effect.fn('AggregateApi.authenticate')(
  function* (props: {
    request: { signature: unknown };
    binding: {
      systemName: string;
      aggregateName: string;
      aggregateVersion: string;
    };
    runtime: ISystemRuntime;
  }) {
    return yield* Effect.gen(function* () {
      const request = yield* Schema.decodeUnknownEffect(
        Schema.Struct({ signature: Schema.Unknown }),
      )(props.request, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'aggregate-authentication-arguments-invalid',
          prefix: 'Invalid aggregate authentication arguments',
        }),
      );
      const authenticated = yield* authenticateAggregate({
        ...props.binding,
        signature: request.signature,
      });
      return new AggregateAccessApi({
        access: { ...props.binding, authenticated },
        runtime: props.runtime,
      });
    }).pipe(
      Effect.catch(error =>
        Effect.succeed(new AggregateAccessApiFailure(error)),
      ),
    );
  },
);
