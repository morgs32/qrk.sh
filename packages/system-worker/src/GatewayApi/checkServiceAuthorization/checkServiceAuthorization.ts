import { type ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { makeServiceFrontendLockKey } from '@zerospin/core/frontendController/makeServiceFrontendLockKey';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import { ZerospinError } from '@zerospin/error';
import { Effect, type Schema } from 'effect';
import { isEqual } from 'es-toolkit';

export const checkServiceAuthorization = Effect.fn(
  'GatewayApi.checkServiceAuthorization',
)(function* (props: {
  authorization: Readonly<{
    authentication: Readonly<Record<string, unknown>>;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
    frontendSpec: IFrontendControllerSpec;
  }>;
  authentication: Readonly<Record<string, unknown>>;
  systemName: string;
  serviceName: string;
  serviceVersion: string;
  frontendName: string;
  serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
}) {
  const {
    authorization,
    authentication,
    systemName,
    serviceName,
    frontendName,
    serviceFrontendLock,
  } = props;

  // 4 — compute submitted and authorized service frontend lock keys
  const submittedLockKey =
    yield* makeServiceFrontendLockKey(serviceFrontendLock);
  const authorizedLockKey = yield* makeServiceFrontendLockKey(
    authorization.serviceFrontendLock,
  );

  // 5 — compare authentication, systemName, serviceName, frontendName, and lock
  if (
    !isEqual(authorization.authentication, authentication) ||
    authorization.frontendSpec.kind !== 'service' ||
    authorization.frontendSpec.systemName !== systemName ||
    authorization.frontendSpec.serviceName !== serviceName ||
    authorization.frontendSpec.serviceVersion !== props.serviceVersion ||
    authorization.frontendSpec.name !== frontendName ||
    authorizedLockKey !== submittedLockKey
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-admission-target-mismatch',
      message:
        'SystemWorker returned a service frontend authorization for a different target or lock',
    });
  }
});
