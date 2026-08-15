import type { IUserRef } from '@zerospin/core/aggregate/types';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { AggregateFrontendApi } from '../../AggregateFrontendApi/AggregateFrontendApi.js';
import { AggregateFrontendApiFailure } from '../../AggregateFrontendApi/AggregateFrontendApiFailure/AggregateFrontendApiFailure.js';
import type { ISystemRuntime } from '../../makeSystemRuntime.js';
import { SystemWorkerResolver } from '../../SystemWorkerResolver/SystemWorkerResolver.js';

export const getAggregateFrontendApi = Effect.fn(
  'AuthenticatedApi.getAggregateFrontendApi',
  { root: true },
)(function* (props: {
  authentication: {
    readonly generationId: string;
    readonly systemId: ISystemId;
    readonly systemWorkerName: string;
    readonly userId: string;
  };
  request: {
    aggregateId: IAggregateId;
    aggregateName: string;
    frontendName: string;
    aggregateFrontendLock: Schema.Schema.Type<
      typeof AggregateFrontendLockSchema
    >;
  };
  runtime: ISystemRuntime;
}) {
  return yield* Effect.gen(function* () {
    const validated = yield* Schema.validate(
      Schema.Struct({
        aggregateId: makeAbbreviationIdSchema(coreAbbreviations.aggregate),
        aggregateName: Schema.String,
        frontendName: Schema.String,
        aggregateFrontendLock: Schema.Unknown,
      }),
    )(props.request, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'failed-to-decode-get-aggregate-frontend-api-props',
        prefix: 'Failed to decode getAggregateFrontendApi arguments',
      }),
    );
    const aggregateFrontendLock = yield* Schema.decodeUnknown(
      AggregateFrontendLockSchema,
    )(validated.aggregateFrontendLock, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'aggregate-frontend-lock-invalid',
        prefix:
          'getAggregateFrontendApi received an invalid aggregate frontend lock',
      }),
    );
    const resolver = yield* SystemWorkerResolver;
    const systemWorker = resolver.get({
      systemWorkerName: props.authentication.systemWorkerName,
    });
    return yield* Effect.gen(function* () {
      const authorized = yield* makeAsync(
        () =>
          systemWorker.authorizeAggregateFrontend({
            aggregateId: validated.aggregateId,
            aggregateName: validated.aggregateName,
            frontendName: validated.frontendName,
            aggregateFrontendLock,
            generationId: props.authentication.generationId,
            userId: props.authentication.userId,
          }),
        cause =>
          ZerospinError.isZerospinError(cause)
            ? cause
            : new ZerospinError({
                code: 'failed-to-authorize-aggregate-frontend-rpc',
                message:
                  'SystemWorker.authorizeAggregateFrontend threw while creating AggregateFrontendApi',
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
      ).pipe(Effect.flatMap(decodeRpc));
      const submittedLockKey = yield* makeAggregateFrontendLockKey(
        aggregateFrontendLock,
      );
      const authorizedLockKey = yield* makeAggregateFrontendLockKey(
        authorized.aggregateFrontendLock,
      );
      if (
        authorized.frontendSpec.kind !== 'aggregate' ||
        authorized.actorRef.aggregateId !== validated.aggregateId ||
        authorized.actorRef.aggregateName !== validated.aggregateName ||
        authorized.actorRef.userId !== props.authentication.userId ||
        authorized.frontendSpec.aggregateName !== validated.aggregateName ||
        authorized.frontendSpec.frontendName !== validated.frontendName ||
        authorizedLockKey !== submittedLockKey
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-admission-target-mismatch',
          message:
            'SystemWorker returned an aggregate frontend authorization for a different target or lock',
        });
      }
      return new AggregateFrontendApi({
        authResults: {
          actorRef: authorized.actorRef satisfies IUserRef,
          aggregateFrontendLock: authorized.aggregateFrontendLock,
          frontendName: validated.frontendName,
          frontendSpec: authorized.frontendSpec,
          generationId: props.authentication.generationId,
          systemId: props.authentication.systemId,
          systemVersion: authorized.systemVersion,
          systemWorkerName: props.authentication.systemWorkerName,
        },
        runtime: props.runtime,
      });
    }).pipe(Effect.ensuring(Effect.sync(() => systemWorker[Symbol.dispose]())));
  }).pipe(
    Effect.catchAll(error =>
      Effect.succeed(new AggregateFrontendApiFailure(error)),
    ),
  );
});
