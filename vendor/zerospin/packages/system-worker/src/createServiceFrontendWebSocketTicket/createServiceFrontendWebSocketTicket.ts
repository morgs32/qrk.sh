import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { MaterializedServiceFrontendRepo } from '../MaterializedServiceFrontendRepo/MaterializedServiceFrontendRepo.js';
import { ServiceFrontendFinalizedCommandChain } from '../ServiceFrontendFinalizedCommandChain/ServiceFrontendFinalizedCommandChain.js';
import { SelectedServiceFrontendLockSchema } from '../StaticSystem/frontendSpecSchemas.js';
import { validateServiceFrontendLock } from '../StaticSystem/validateServiceFrontendLock/validateServiceFrontendLock.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const createServiceFrontendWebSocketTicket = Effect.fn(
  'SystemWorker.createServiceFrontendWebSocketTicket',
  { root: true },
)(function* (props: {
  serviceName: string;
  userId: string;
  frontendName: string;
  serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  configuredSystemId: string;
}) {
  const {
    configuredSystemId,
    frontendName,
    serviceFrontendLock,
    serviceName,
    userId,
  } = props;
  const systemId = yield* Schema.decodeUnknownEffect(
    makeAbbreviationIdSchema(coreAbbreviations.system),
  )(configuredSystemId).pipe(
    mapParseError({
      code: 'service-frontend-websocket-ticket-system-id-invalid',
      prefix: 'Failed to decode service frontend ticket systemId',
    }),
  );
  const selectedUnknown = yield* validateServiceFrontendLock({
    serviceName: serviceName,
    frontendName: frontendName,
    serviceFrontendLock: serviceFrontendLock,
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

  const key = {
    systemId,
    serviceName: serviceName,
    userId,
    frontendName: frontendName,
  };
  const repoName =
    yield* ServiceFrontendFinalizedCommandChain.fixedDORepoConfig.nameUtils.makeName(
      key,
    );
  const materializedServiceFrontendRepoName =
    yield* MaterializedServiceFrontendRepo.fixedDORepoConfig.nameUtils.makeName(
      key,
    );
  const systemRepo = SystemRepo.getRepo({
    systemId,
  });
  const projectionRegistrations = yield* makeAsync(() =>
    systemRepo.getRepoRegistrations({
      repoType: 'MaterializedServiceFrontendRepo',
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  if (
    !projectionRegistrations.some(
      registration =>
        registration.repoName === materializedServiceFrontendRepoName,
    )
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-state-required',
      message:
        'Service frontend state must initialize before a WebSocket ticket can be created',
      extra: {
        serviceName: serviceName,
        userId,
        frontendName: frontendName,
      },
    });
  }

  const ticket = yield* makeAsync(() =>
    systemRepo.createServiceFrontendWebSocketTicket({
      repoName,
      serviceName: serviceName,
      userId,
      frontendName: frontendName,
      serviceFrontendLock: selected.serviceFrontendLock,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  return { ticket };
});
