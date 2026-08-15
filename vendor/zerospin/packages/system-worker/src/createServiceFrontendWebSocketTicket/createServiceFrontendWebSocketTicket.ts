import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { getServiceFrontendBlockRepo } from '../ServiceFrontendBlockRepo/getServiceFrontendBlockRepo/getServiceFrontendBlockRepo.js';
import { ServiceFrontendBlockRepo } from '../ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.js';
import { getServiceFrontendRepo } from '../ServiceFrontendRepo/getServiceFrontendRepo/getServiceFrontendRepo.js';
import { ServiceFrontendRepo } from '../ServiceFrontendRepo/ServiceFrontendRepo.js';
import { SelectedServiceFrontendLockSchema } from '../StaticSystem/frontendSpecSchemas.js';
import { validateServiceFrontendLock } from '../StaticSystem/validateServiceFrontendLock/validateServiceFrontendLock.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const createServiceFrontendWebSocketTicket = Effect.fn(
  'SystemWorker.createServiceFrontendWebSocketTicket',
  { root: true },
)(function* (props: {
  generationId: string;
  serviceName: string;
  userId: string;
  frontendName: string;
  serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
  configuredSystemId: string;
}) {
  const systemId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.system),
  )(props.configuredSystemId).pipe(
    mapParseError({
      code: 'service-frontend-websocket-ticket-system-id-invalid',
      prefix: 'Failed to decode service frontend ticket systemId',
    }),
  );
  const userId = yield* Schema.decodeUnknown(Schema.NonEmptyString)(
    props.userId,
  ).pipe(
    mapParseError({
      code: 'service-frontend-websocket-ticket-user-id-invalid',
      prefix: 'Failed to decode service frontend ticket userId',
    }),
  );
  const generationId = props.generationId;
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

  const key = {
    generationId,
    serviceName: props.serviceName,
    userId,
    frontendName: props.frontendName,
  };
  const repoName =
    yield* ServiceFrontendBlockRepo.boundDORepoConfig.nameUtils.makeName(key);
  const projectionRepoName =
    yield* ServiceFrontendRepo.boundDORepoConfig.nameUtils.makeName(key);
  const systemRepo = SystemRepo.getRepo({
    systemId,
  });
  const projectionRegistrations = yield* makeAsync(() =>
    systemRepo.getRepoRegistrations({
      generationId,
      repoType: 'ServiceFrontendRepo',
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  const archiveRegistrations = yield* makeAsync(() =>
    systemRepo.getRepoRegistrations({
      generationId,
      repoType: 'ServiceFrontendBlockRepo',
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  if (
    !projectionRegistrations.some(
      registration => registration.repoName === projectionRepoName,
    ) ||
    !archiveRegistrations.some(
      registration => registration.repoName === repoName,
    )
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-state-required',
      message:
        'Service frontend state must initialize before a WebSocket ticket can be created',
      extra: {
        generationId,
        serviceName: props.serviceName,
        userId,
        frontendName: props.frontendName,
      },
    });
  }

  const serviceFrontendRepo = yield* getServiceFrontendRepo({ key });
  const readinessUnknown = yield* makeAsync(() =>
    serviceFrontendRepo.getProjectionReadiness(),
  );
  const readinessEncoded = yield* Schema.decodeUnknown(
    Schema.Union(
      Schema.Struct({
        _tag: Schema.Literal('Right'),
        right: Schema.Struct({
          generationId: Schema.String,
          frontendIndex: Schema.Number,
        }),
      }),
      Schema.Struct({
        _tag: Schema.Literal('Left'),
        left: Schema.encodedSchema(ZerospinError.schema),
      }),
    ),
  )(readinessUnknown).pipe(
    mapParseError({
      code: 'service-frontend-ticket-readiness-rpc-invalid',
      prefix: 'Failed to decode ServiceFrontendRepo readiness RPC',
    }),
  );
  const readiness = yield* decodeRpc(readinessEncoded);
  if (readiness.generationId !== generationId) {
    return yield* new ZerospinError({
      code: 'service-frontend-ticket-readiness-generation-mismatch',
      message:
        'Service frontend ticket readiness belongs to another generation',
      extra: {
        generationId,
        readinessGenerationId: readiness.generationId,
      },
    });
  }

  const serviceFrontendBlockRepo = yield* getServiceFrontendBlockRepo({ key });
  const descriptorUnknown = yield* makeAsync(() =>
    serviceFrontendBlockRepo.getPredecessor(),
  );
  const descriptorEncoded = yield* Schema.decodeUnknown(
    Schema.Union(
      Schema.Struct({
        _tag: Schema.Literal('Right'),
        right: Schema.Struct({
          systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
          generationId: Schema.String,
          serviceName: Schema.String,
          userId: Schema.NonEmptyString,
          frontendName: Schema.String,
          terminalFrontendIndex: Schema.Number,
        }),
      }),
      Schema.Struct({
        _tag: Schema.Literal('Left'),
        left: Schema.encodedSchema(ZerospinError.schema),
      }),
    ),
  )(descriptorUnknown).pipe(
    mapParseError({
      code: 'service-frontend-ticket-archive-descriptor-invalid',
      prefix: 'Failed to decode ServiceFrontendBlockRepo descriptor RPC',
    }),
  );
  const descriptor = yield* decodeRpc(descriptorEncoded);
  if (
    descriptor.systemId !== systemId ||
    descriptor.generationId !== generationId ||
    descriptor.serviceName !== props.serviceName ||
    descriptor.userId !== userId ||
    descriptor.frontendName !== props.frontendName ||
    descriptor.terminalFrontendIndex < readiness.frontendIndex
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-ticket-archive-target-mismatch',
      message:
        'Service frontend ticket target is not covered by its immutable archive',
    });
  }
  const archiveReadinessUnknown = yield* makeAsync(() =>
    serviceFrontendBlockRepo.assertArchiveThrough({
      frontendIndex: readiness.frontendIndex,
    }),
  );
  const archiveReadinessEncoded = yield* Schema.decodeUnknown(
    Schema.Union(
      Schema.Struct({
        _tag: Schema.Literal('Right'),
        right: Schema.Undefined,
      }),
      Schema.Struct({
        _tag: Schema.Literal('Left'),
        left: Schema.encodedSchema(ZerospinError.schema),
      }),
    ),
  )(archiveReadinessUnknown).pipe(
    mapParseError({
      code: 'service-frontend-ticket-archive-rpc-invalid',
      prefix: 'Failed to decode ServiceFrontendBlockRepo readiness RPC',
    }),
  );
  yield* decodeRpc(archiveReadinessEncoded);

  const ticket = yield* makeAsync(() =>
    systemRepo.createServiceFrontendWebSocketTicket({
      generationId,
      repoName,
      serviceName: props.serviceName,
      userId,
      frontendName: props.frontendName,
      serviceFrontendLock: selected.serviceFrontendLock,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  return { ticket };
});
