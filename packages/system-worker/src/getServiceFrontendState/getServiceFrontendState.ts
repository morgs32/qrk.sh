/*
 * Resolves one actor-specific service projection only after read admission and
 * complete target validation against the deployed controller graph.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IActorId } from '@zerospin/core/models/types';
import { ServiceFrontendStateSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';
import { system } from 'system';

import { getServiceFrontendRepo } from '../ServiceFrontendRepo/getServiceFrontendRepo/getServiceFrontendRepo.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const getServiceFrontendState = Effect.fn(
  'SystemWorker.getServiceFrontendState',
  { root: true },
)(function* (props: {
  deployId: string;
  generationId: string;
  serviceName: string;
  actorName: string;
  actorId: IActorId;
  frontendName: string;
  systemWorkerName: string;
}): Effect.fn.Return<IServiceFrontendState, IAnyError, Async> {
  const systemRepo = SystemRepo.getRepo({
    generationId: props.generationId,
  });
  const generationState = yield* makeAsync(() =>
    systemRepo.getGenerationState(),
  ).pipe(Effect.flatMap(decodeRpc));
  if (generationState === null) {
    return yield* new ZerospinError({
      code: 'frontend-authority-generation-missing',
      message:
        'The bound service frontend generation has no authoritative lifecycle state',
      extra: { generationId: props.generationId },
    });
  }
  if (generationState.generationId !== props.generationId) {
    return yield* new ZerospinError({
      code: 'frontend-authority-generation-mismatch',
      message:
        'The bound service frontend generation does not match its authoritative lifecycle state',
      extra: {
        generationId: props.generationId,
        storedGenerationId: generationState.generationId,
      },
    });
  }
  if (generationState.admission === 'drained') {
    if (generationState.successorGenerationId === null) {
      return yield* new ZerospinError({
        code: 'frontend-successor-generation-missing',
        message:
          'The drained service frontend generation has no recorded successor',
        extra: { generationId: props.generationId },
      });
    }
    return yield* new ZerospinError({
      code: 'frontend-generation-changed',
      message:
        'The authoritative service frontend belongs to a recorded successor generation',
      extra: {
        generationId: props.generationId,
        successorGenerationId: generationState.successorGenerationId,
        serviceName: props.serviceName,
        actorId: props.actorId,
        actorName: props.actorName,
        frontendName: props.frontendName,
      },
    });
  }
  if (generationState.activeSystemSpec === null) {
    return yield* new ZerospinError({
      code: 'frontend-authority-system-spec-missing',
      message:
        'The bound service frontend generation has no active authoritative SystemSpec',
      extra: { generationId: props.generationId },
    });
  }
  const runtimeSystemSpec = makeSystemSpec({ system });
  const runtimeFrontendBinding =
    runtimeSystemSpec.serviceControllers[props.serviceName]?.actorControllers[
      props.actorName
    ]?.frontends[props.frontendName];
  const authoritativeFrontendBinding =
    generationState.activeSystemSpec.serviceControllers[props.serviceName]
      ?.actorControllers[props.actorName]?.frontends[props.frontendName];
  if (runtimeFrontendBinding === undefined) {
    return yield* new ZerospinError({
      code: 'frontend-identity-changed',
      message:
        'The bound SystemWorker no longer defines the authenticated service frontend identity',
      extra: {
        generationId: props.generationId,
        serviceName: props.serviceName,
        actorName: props.actorName,
        frontendName: props.frontendName,
      },
    });
  }
  if (authoritativeFrontendBinding === undefined) {
    return yield* new ZerospinError({
      code: 'frontend-identity-changed',
      message:
        'The active SystemSpec no longer defines the authenticated service frontend identity',
      extra: {
        generationId: props.generationId,
        serviceName: props.serviceName,
        actorName: props.actorName,
        frontendName: props.frontendName,
      },
    });
  }
  if (
    !isEqual(
      runtimeFrontendBinding.frontendController,
      authoritativeFrontendBinding.frontendController,
    )
  ) {
    return yield* new ZerospinError({
      code: 'frontend-version-changed',
      message:
        'The authoritative service frontend version or specification has changed within this generation',
      extra: {
        generationId: props.generationId,
        serviceName: props.serviceName,
        actorId: props.actorId,
        actorName: props.actorName,
        frontendName: props.frontendName,
        frontendVersion: runtimeFrontendBinding.frontendController.version,
        authoritativeFrontendVersion:
          authoritativeFrontendBinding.frontendController.version,
      },
    });
  }
  yield* makeAsync(() =>
    systemRepo.assertGenerationAdmission({
      deployId: props.deployId,
      mode: 'read',
    }),
  ).pipe(Effect.flatMap(decodeRpc));

  const serviceController = yield* getByKeyOrThrow({
    record: system.serviceControllers,
    key: props.serviceName,
    recordKind: 'service controllers',
  });
  const actorController = yield* getByKeyOrThrow({
    record: serviceController.actorControllers,
    key: props.actorName,
    recordKind: `actor controllers owned by service ${props.serviceName}`,
  });
  yield* getByKeyOrThrow({
    record: actorController.frontends,
    key: props.frontendName,
    recordKind: `frontends owned by service actor ${props.serviceName}.${props.actorName}`,
  });

  const actorId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.actor),
  )(props.actorId).pipe(
    mapParseError({
      code: 'service-frontend-state-actor-id-invalid',
      prefix: 'Failed to decode service frontend state actorId',
    }),
  );

  const lineageUnknown = yield* makeAsync(() =>
    systemRepo.resolveFrontendProjectionLineage({
      deployId: props.deployId,
      target: {
        kind: 'service',
        serviceName: props.serviceName,
        actorName: props.actorName,
        actorId,
        frontendName: props.frontendName,
      },
    }),
  );
  const lineageEncoded = yield* Schema.decodeUnknown(
    Schema.Union(
      Schema.Struct({
        _tag: Schema.Literal('Right'),
        right: Schema.Struct({
          mode: Schema.Literal('live', 'no-local-segment'),
          predecessor: Schema.NullOr(
            Schema.Struct({
              generationId: Schema.String,
              repoName: Schema.String,
              terminalFrontendIndex: Schema.Number,
            }),
          ),
        }),
      }),
      Schema.Struct({
        _tag: Schema.Literal('Left'),
        left: Schema.encodedSchema(ZerospinError.schema),
      }),
    ),
  )(lineageUnknown).pipe(
    mapParseError({
      code: 'service-frontend-lineage-rpc-invalid',
      prefix: 'Failed to decode SystemRepo service frontend lineage RPC',
    }),
  );
  const lineage = yield* decodeRpc(lineageEncoded);

  const serviceFrontendRepo = yield* getServiceFrontendRepo({
    key: {
      generationId: props.generationId,
      serviceName: props.serviceName,
      actorName: props.actorName,
      actorId,
      frontendName: props.frontendName,
    },
  });
  const stateUnknown = yield* makeAsync(() =>
    serviceFrontendRepo.getFrontendState({
      systemId: env.ZEROSPIN_SYSTEM_ID,
      systemWorkerName: props.systemWorkerName,
      serviceName: props.serviceName,
      actorName: props.actorName,
      actorId,
      frontendName: props.frontendName,
      lineage,
    }),
  );
  const stateEncoded = yield* Schema.decodeUnknown(
    Schema.Union(
      Schema.Struct({
        _tag: Schema.Literal('Right'),
        right: Schema.typeSchema(ServiceFrontendStateSchema),
      }),
      Schema.Struct({
        _tag: Schema.Literal('Left'),
        left: Schema.encodedSchema(ZerospinError.schema),
      }),
    ),
  )(stateUnknown).pipe(
    mapParseError({
      code: 'service-frontend-state-rpc-invalid',
      prefix: 'Failed to decode ServiceFrontendRepo state RPC',
    }),
  );
  return yield* decodeRpc(stateEncoded);
});
