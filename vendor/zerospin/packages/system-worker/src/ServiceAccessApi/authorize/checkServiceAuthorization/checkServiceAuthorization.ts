import { makeServiceSessionLockKey } from '@zerospin/core/serviceSession/make/makeServiceSessionLockKey';
import type { IServiceSessionSpec } from '@zerospin/core/serviceSession/make/makeServiceSessionSpec';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { makeZerospinError } from '@zerospin/error';
import { Effect } from 'effect';
import { isEqual } from 'es-toolkit';

export const checkServiceAuthorization = Effect.fn(
  'ServiceAccessApi.checkServiceAuthorization',
)(function* (props: {
  authorization: Readonly<{
    claims: Readonly<Record<string, unknown>>;
    serviceSessionLock: IServiceSessionLock;
    sessionSpec: IServiceSessionSpec;
  }>;
  claims: Readonly<Record<string, unknown>>;
  serviceName: string;
  serviceVersion: string;
  sessionName: string;
  serviceSessionLock: IServiceSessionLock;
}) {
  const {
    authorization,
    claims,
    serviceName,
    sessionName,
    serviceSessionLock,
    serviceVersion,
  } = props;

  // 4 — compute submitted and authorized service definition lock keys
  const submittedLockKey = yield* makeServiceSessionLockKey(serviceSessionLock);
  const authorizedLockKey = yield* makeServiceSessionLockKey(
    authorization.serviceSessionLock,
  );

  // 5 — compare claims, serviceName, sessionName, and lock
  if (
    !isEqual(authorization.claims, claims) ||
    authorization.sessionSpec.serviceName !== serviceName ||
    authorization.sessionSpec.serviceVersion !== serviceVersion ||
    authorization.sessionSpec.sessionName !== sessionName ||
    authorizedLockKey !== submittedLockKey
  ) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'service-session-admission-target-mismatch',
        message:
          'SystemWorker returned a service definition authorization for a different target or lock',
      }),
    );
  }
});
