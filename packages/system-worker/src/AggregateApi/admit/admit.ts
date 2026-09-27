import { AdmissionRequestSchema } from '@zerospin/core/identity/AdmissionRequestSchema';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import type { ISystem } from '@zerospin/core/system/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { AggregateAccessApi } from '../../AggregateAccessApi/AggregateAccessApi.js';
import { AggregateAccessApiFailure } from '../../AggregateAccessApi/AggregateAccessApiFailure/AggregateAccessApiFailure.js';

import { admitAggregate } from './admitAggregate/admitAggregate.js';

export const admit = Effect.fn('AggregateApi.admit')(function* (props: {
  request: IAdmissionRequest;
  binding: {
    systemName: string;
    aggregateName: string;
    aggregateVersion: string;
    actorName: string;
    actorVersion: string;
  };
  runtime: ISystem['runtime'];
}) {
  return yield* Effect.gen(function* () {
    const request = yield* Schema.decodeUnknownEffect(AdmissionRequestSchema)(
      props.request,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'aggregate-identity-arguments-invalid',
        prefix: 'Invalid aggregate identity arguments',
      }),
    );
    const admitted = yield* admitAggregate({
      ...props.binding,
      request,
    });
    return new AggregateAccessApi({
      access: { ...props.binding, admitted },
      runtime: props.runtime,
    });
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(new AggregateAccessApiFailure(makeZerospinError(error))),
    ),
  );
});
