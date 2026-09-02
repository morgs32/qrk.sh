import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import type { IFrontendControllerSpec } from '@zerospin/core/frontendController/types';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, type IAnyError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { getMaterializedServiceRepo } from '../MaterializedServiceRepo/getMaterializedServiceRepo/getMaterializedServiceRepo.js';
import { MaterializedServiceRepo } from '../MaterializedServiceRepo/MaterializedServiceRepo.js';
import { SelectedServiceFrontendLockSchema } from '../StaticSystem/frontendSpecSchemas.js';
import { validateServiceFrontendLock } from '../StaticSystem/validateServiceFrontendLock/validateServiceFrontendLock.js';

export const authorizeServiceFrontend = Effect.fn(
  'SystemWorker.authorizeServiceFrontend',
  { root: true },
)(function* (props: {
  userId: string;
  serviceName: string;
  frontendName: string;
  serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
}): Effect.fn.Return<
  Readonly<{
    userId: string;
    serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
    frontendSpec: IFrontendControllerSpec;
    systemVersion: string;
  }>,
  IAnyError,
  Async
> {
  const { userId, serviceName, frontendName, serviceFrontendLock } = props;
  const systemSpec = makeSystemSpec({ system });
  const selectedUnknown = yield* validateServiceFrontendLock({
    serviceName,
    frontendName,
    serviceFrontendLock,
  });
  const selected = yield* Schema.decodeUnknownEffect(
    SelectedServiceFrontendLockSchema,
  )(selectedUnknown, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-runtime-service-frontend-lock-invalid',
      prefix:
        'The static System returned an invalid selected service frontend lock',
    }),
  );
  const serviceRepo = yield* getMaterializedServiceRepo({
    key: { systemId: env.ZEROSPIN_SYSTEM_ID, serviceName },
  });
  yield* makeAsync<
    Awaited<ReturnType<MaterializedServiceRepo['authorizeServiceFrontend']>>
  >(() =>
    serviceRepo.authorizeServiceFrontend({
      serviceName,
      frontendName,
      userId,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  return {
    userId,
    serviceFrontendLock: selected.serviceFrontendLock,
    frontendSpec: selected.frontendSpec,
    systemVersion: systemSpec.version,
  };
});
