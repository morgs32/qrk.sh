import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, type IAnyError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';

import { SelectedServiceFrontendLockSchema } from '../StaticSystem/frontendSpecSchemas.js';
import { validateServiceFrontendLock } from '../StaticSystem/validateServiceFrontendLock/validateServiceFrontendLock.js';
import { VersionedServiceRepo } from '../VersionedServiceRepo/VersionedServiceRepo.js';

/*
 * GatewayApi uses this operation to admit a service frontend for an
 * authenticated userId and caller-selected owner/frontend fields.
 * The service Repo runs authorization against its local resource state.
 *
 * 1. Validate the requested frontend lock.
 * 2. Decode the selected frontend definition.
 * 3. Authorize against owner-local state.
 * 4. Return the admitted frontend definition.
 */
export const authorizeServiceFrontend = Effect.fn(
  'SystemWorker.authorizeServiceFrontend',
  { root: true },
)(function* (props: {
  userId: string;
  serviceName: string;
  serviceVersion: string;
  frontendName: string;
  serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
}): Effect.fn.Return<
  Readonly<{
    userId: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
    frontendSpec: IFrontendControllerSpec;
  }>,
  IAnyError,
  Async
> {
  const { userId, serviceName, frontendName, serviceFrontendLock } = props;

  // 1 — resolve the authored service frontend and its supported lock
  const selectedUnknown = yield* validateServiceFrontendLock({
    serviceVersion: props.serviceVersion,
    serviceName,
    frontendName,
    serviceFrontendLock,
  });

  // 2 — check the selected lock and frontendSpec shape before returning admission
  const selected = yield* Schema.decodeUnknownEffect(
    SelectedServiceFrontendLockSchema,
  )(selectedUnknown, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-runtime-service-frontend-lock-invalid',
      prefix:
        'The static System returned an invalid selected service frontend lock',
    }),
  );

  // 3 — open the service Repo and run authorizeServiceFrontend with the authenticated userId
  const serviceVersion = props.serviceVersion;
  const serviceRepo = yield* VersionedServiceRepo.getRepo({
    key: { systemId: env.ZEROSPIN_SYSTEM_ID, serviceName, serviceVersion },
  });
  yield* makeAsync<
    Awaited<ReturnType<VersionedServiceRepo['authorizeServiceFrontend']>>
  >(() =>
    serviceRepo.authorizeServiceFrontend({
      serviceName,
      frontendName,
      userId,
    }),
  ).pipe(Effect.flatMap(decodeRpc));

  // 4 — return the checked lock, frontendSpec
  return {
    userId,
    serviceFrontendLock: selected.serviceFrontendLock,
    frontendSpec: selected.frontendSpec,
  };
});
