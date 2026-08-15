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

import { getServiceRepo } from '../ServiceRepo/getServiceRepo/getServiceRepo.js';
import { SelectedServiceFrontendLockSchema } from '../StaticSystem/frontendSpecSchemas.js';
import { validateServiceFrontendLock } from '../StaticSystem/validateServiceFrontendLock/validateServiceFrontendLock.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const authorizeServiceFrontend = Effect.fn(
  'SystemWorker.authorizeServiceFrontend',
  { root: true },
)(function* (props: {
  generationId: string;
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
  const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
    props.userId,
  ).pipe(
    mapParseError({
      code: 'service-frontend-authorization-user-id-invalid',
      prefix: 'Failed to decode service frontend authorization userId',
    }),
  );
  const systemSpec = makeSystemSpec({ system });
  const selectedUnknown = yield* validateServiceFrontendLock({
    serviceName: props.serviceName,
    frontendName: props.frontendName,
    serviceFrontendLock: props.serviceFrontendLock,
  });
  const selected = yield* Schema.decodeUnknown(
    SelectedServiceFrontendLockSchema,
  )(selectedUnknown, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-runtime-service-frontend-lock-invalid',
      prefix:
        'The static System returned an invalid selected service frontend lock',
    }),
  );
  yield* makeAsync(() =>
    SystemRepo.getRepo({
      systemId: env.ZEROSPIN_SYSTEM_ID,
    }).assertGenerationAdmission({
      generationId: props.generationId,
      mode: 'read',
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  const serviceRepo = yield* getServiceRepo({
    key: { generationId: props.generationId, serviceName: props.serviceName },
  });
  yield* makeAsync(() =>
    serviceRepo.authorizeServiceFrontend({
      serviceName: props.serviceName,
      frontendName: props.frontendName,
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
