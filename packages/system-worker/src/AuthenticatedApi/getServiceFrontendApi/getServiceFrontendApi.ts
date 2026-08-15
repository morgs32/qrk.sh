import { makeAsync } from '@zerospin/core/async/makeAsync';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { makeServiceFrontendLockKey } from '@zerospin/core/frontendController/makeServiceFrontendLockKey';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { ISystemRuntime } from '../../makeSystemRuntime.js';
import { ServiceFrontendApi } from '../../ServiceFrontendApi/ServiceFrontendApi.js';
import { ServiceFrontendApiFailure } from '../../ServiceFrontendApi/ServiceFrontendApiFailure/ServiceFrontendApiFailure.js';
import { SystemWorkerResolver } from '../../SystemWorkerResolver/SystemWorkerResolver.js';

export const getServiceFrontendApi = Effect.fn(
  'AuthenticatedApi.getServiceFrontendApi',
  { root: true },
)(function* (props: {
  authentication: {
    readonly generationId: string;
    readonly systemId: ISystemId;
    readonly systemWorkerName: string;
    readonly userId: string;
  };
  request: {
    serviceName: string;
    frontendName: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  };
  runtime: ISystemRuntime;
}) {
  return yield* Effect.gen(function* () {
    const validated = yield* Schema.validate(
      Schema.Struct({
        serviceName: Schema.String,
        frontendName: Schema.String,
        serviceFrontendLock: Schema.Unknown,
      }),
    )(props.request, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'failed-to-decode-get-service-frontend-api-props',
        prefix: 'Failed to decode getServiceFrontendApi arguments',
      }),
    );
    const serviceFrontendLock = yield* Schema.decodeUnknown(
      ServiceFrontendLockSchema,
    )(validated.serviceFrontendLock, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'service-frontend-lock-invalid',
        prefix:
          'getServiceFrontendApi received an invalid service frontend lock',
      }),
    );
    const resolver = yield* SystemWorkerResolver;
    const systemWorker = resolver.get({
      systemWorkerName: props.authentication.systemWorkerName,
    });
    return yield* Effect.gen(function* () {
      const authorized = yield* makeAsync(
        () =>
          systemWorker.authorizeServiceFrontend({
            generationId: props.authentication.generationId,
            serviceName: validated.serviceName,
            frontendName: validated.frontendName,
            serviceFrontendLock,
            userId: props.authentication.userId,
          }),
        cause =>
          ZerospinError.isZerospinError(cause)
            ? cause
            : new ZerospinError({
                code: 'failed-to-authorize-service-frontend-rpc',
                message:
                  'SystemWorker.authorizeServiceFrontend threw during admission',
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
      ).pipe(Effect.flatMap(decodeRpc));
      const submittedLockKey =
        yield* makeServiceFrontendLockKey(serviceFrontendLock);
      const authorizedLockKey = yield* makeServiceFrontendLockKey(
        authorized.serviceFrontendLock,
      );
      if (
        authorized.userId !== props.authentication.userId ||
        authorized.frontendSpec.kind !== 'service' ||
        authorized.frontendSpec.serviceName !== validated.serviceName ||
        authorized.frontendSpec.frontendName !== validated.frontendName ||
        authorizedLockKey !== submittedLockKey
      ) {
        return yield* new ZerospinError({
          code: 'service-frontend-admission-target-mismatch',
          message:
            'SystemWorker returned a service frontend authorization for a different target or lock',
        });
      }
      return new ServiceFrontendApi({
        authResults: {
          frontendName: validated.frontendName,
          frontendSpec: authorized.frontendSpec,
          generationId: props.authentication.generationId,
          serviceFrontendLock: authorized.serviceFrontendLock,
          serviceName: validated.serviceName,
          systemId: props.authentication.systemId,
          systemVersion: authorized.systemVersion,
          systemWorkerName: props.authentication.systemWorkerName,
          userId: props.authentication.userId,
        },
        runtime: props.runtime,
      });
    }).pipe(Effect.ensuring(Effect.sync(() => systemWorker[Symbol.dispose]())));
  }).pipe(
    Effect.catchAll(error =>
      Effect.succeed(new ServiceFrontendApiFailure(error)),
    ),
  );
});
