/*
 * 1. Resolve the bound service frontend through a recorded successor chain.
 * 2. Validate the authoritative actor-specific target and archive lineage.
 * 3. Require the projection and archive registrations to exist as a pair.
 * 4. Prove the archive covers the projection's advertised frontend index.
 * 5. Mint a distinct service-frontend ticket only in the authoritative SystemRepo.
 */

import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IActorId } from '@zerospin/core/models/types';
import { checkSystemCompatibility } from '@zerospin/core/system/checkSystemCompatibility';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import type { ISystemId } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { getServiceFrontendBlockRepo } from '../ServiceFrontendBlockRepo/getServiceFrontendBlockRepo/getServiceFrontendBlockRepo.js';
import { ServiceFrontendBlockRepo } from '../ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.js';
import { getServiceFrontendRepo } from '../ServiceFrontendRepo/getServiceFrontendRepo/getServiceFrontendRepo.js';
import { ServiceFrontendRepo } from '../ServiceFrontendRepo/ServiceFrontendRepo.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const createServiceFrontendWebSocketTicket = Effect.fn(
  'SystemWorker.createServiceFrontendWebSocketTicket',
  { root: true },
)(function* (props: {
  deployId: string;
  generationId: string;
  serviceName: string;
  actorName: string;
  actorId: IActorId;
  frontendName: string;
  configuredSystemId: string;
}): Effect.fn.Return<
  Readonly<{
    ticket: string;
    systemId: ISystemId;
    generationId: string;
    serviceName: string;
    actorId: IActorId;
    actorName: string;
    frontendName: string;
    frontendVersion: string;
  }>,
  IAnyError,
  Async
> {
  // Checkpoint 1: validate the opaque actor syntax before any actor-specific
  // repository target can be selected.
  const actorId = yield* Schema.decodeUnknown(
    makeAbbreviationIdSchema(coreAbbreviations.actor),
  )(props.actorId).pipe(
    mapParseError({
      code: 'service-frontend-websocket-ticket-actor-id-invalid',
      prefix: 'Failed to decode service frontend ticket actorId',
    }),
  );
  const runtimeSystemSpec = makeSystemSpec({ system });
  const sourceFrontendBinding =
    runtimeSystemSpec.serviceControllers[props.serviceName]?.actorControllers[
      props.actorName
    ]?.frontends[props.frontendName];
  if (sourceFrontendBinding === undefined) {
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

  // Checkpoint 2: ticket minting may follow authority, but only across a durable
  // forward link whose target records the exact inverse predecessor.
  const sourceSystemRepo = SystemRepo.getRepo({
    generationId: props.generationId,
  });
  const sourceGenerationState = yield* makeAsync(() =>
    sourceSystemRepo.getGenerationState(),
  ).pipe(Effect.flatMap(decodeRpc));
  if (sourceGenerationState === null) {
    return yield* new ZerospinError({
      code: 'service-frontend-ticket-authority-generation-missing',
      message:
        'The bound service frontend generation has no authoritative lifecycle state',
      extra: { generationId: props.generationId },
    });
  }
  if (sourceGenerationState.generationId !== props.generationId) {
    return yield* new ZerospinError({
      code: 'service-frontend-ticket-authority-generation-mismatch',
      message:
        'The bound service frontend generation does not match its authoritative lifecycle state',
      extra: {
        generationId: props.generationId,
        storedGenerationId: sourceGenerationState.generationId,
      },
    });
  }

  const visitedGenerationIds = new Set<string>();
  visitedGenerationIds.add(props.generationId);
  let authorityGenerationId = props.generationId;
  let authorityGenerationState = sourceGenerationState;
  while (authorityGenerationState.admission === 'drained') {
    if (
      authorityGenerationState.readiness !== 'ready' ||
      authorityGenerationState.activeDeployId === null ||
      authorityGenerationState.activeSystemSpec === null ||
      authorityGenerationState.drainFrozenAt === null ||
      authorityGenerationState.drainedAt === null ||
      authorityGenerationState.successorGenerationId === null
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-ticket-successor-chain-incomplete',
        message:
          'A drained service frontend generation has incomplete successor lifecycle state',
        extra: { generationId: authorityGenerationId },
      });
    }

    const successorGenerationId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.generation),
    )(authorityGenerationState.successorGenerationId).pipe(
      mapParseError({
        code: 'service-frontend-ticket-successor-generation-invalid',
        prefix: 'Recorded service frontend successor generation is invalid',
        extra: { generationId: authorityGenerationId },
      }),
    );
    if (visitedGenerationIds.has(successorGenerationId)) {
      return yield* new ZerospinError({
        code: 'service-frontend-ticket-successor-cycle',
        message:
          'The recorded service frontend successor chain contains a cycle',
        extra: {
          generationId: authorityGenerationId,
          successorGenerationId,
        },
      });
    }

    const successorSystemRepo = SystemRepo.getRepo({
      generationId: successorGenerationId,
    });
    const successorGenerationState = yield* makeAsync(() =>
      successorSystemRepo.getGenerationState(),
    ).pipe(Effect.flatMap(decodeRpc));
    if (successorGenerationState === null) {
      return yield* new ZerospinError({
        code: 'service-frontend-ticket-successor-generation-missing',
        message:
          'A recorded service frontend successor has no authoritative lifecycle state',
        extra: {
          generationId: authorityGenerationId,
          successorGenerationId,
        },
      });
    }
    if (
      successorGenerationState.generationId !== successorGenerationId ||
      successorGenerationState.prevGenerationId !== authorityGenerationId
    ) {
      return yield* new ZerospinError({
        code: 'service-frontend-ticket-successor-chain-mismatch',
        message:
          'The recorded service frontend successor does not point back to its predecessor generation',
        extra: {
          generationId: authorityGenerationId,
          successorGenerationId,
          storedGenerationId: successorGenerationState.generationId,
          predecessorGenerationId: successorGenerationState.prevGenerationId,
        },
      });
    }

    visitedGenerationIds.add(successorGenerationId);
    authorityGenerationId = successorGenerationId;
    authorityGenerationState = successorGenerationState;
  }

  if (
    authorityGenerationState.readiness !== 'ready' ||
    (authorityGenerationState.admission !== 'open' &&
      authorityGenerationState.admission !== 'draining') ||
    authorityGenerationState.activeDeployId === null ||
    authorityGenerationState.activeSystemSpec === null
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-ticket-authority-not-open',
      message:
        'The authoritative service frontend generation is not ready with read admission',
      extra: {
        generationId: authorityGenerationId,
        readiness: authorityGenerationState.readiness,
        admission: authorityGenerationState.admission,
      },
    });
  }
  const authorityDeployId = authorityGenerationState.activeDeployId;
  const authoritySystemSpec = authorityGenerationState.activeSystemSpec;
  if (authoritySystemSpec.systemName !== runtimeSystemSpec.systemName) {
    return yield* new ZerospinError({
      code: 'service-frontend-ticket-authority-system-mismatch',
      message:
        'The authoritative service frontend successor belongs to a different system identity',
      extra: {
        generationId: authorityGenerationId,
        systemName: runtimeSystemSpec.systemName,
        authoritativeSystemName: authoritySystemSpec.systemName,
      },
    });
  }

  const authoritativeFrontendBinding =
    authoritySystemSpec.serviceControllers[props.serviceName]?.actorControllers[
      props.actorName
    ]?.frontends[props.frontendName];
  if (
    authoritativeFrontendBinding === undefined ||
    authoritativeFrontendBinding.frontendController.serviceName !==
      props.serviceName ||
    authoritativeFrontendBinding.frontendController.actorName !==
      props.actorName ||
    authoritativeFrontendBinding.frontendController.frontendName !==
      props.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'frontend-identity-changed',
      message:
        'The authoritative generation does not contain the bound service frontend identity',
      extra: {
        generationId: authorityGenerationId,
        serviceName: props.serviceName,
        actorName: props.actorName,
        frontendName: props.frontendName,
      },
    });
  }

  if (authorityGenerationId === props.generationId) {
    const compatibility = yield* checkSystemCompatibility({
      prior: runtimeSystemSpec,
      next: authoritySystemSpec,
    });
    if (compatibility.requiresNewGeneration) {
      return yield* new ZerospinError({
        code: 'service-frontend-ticket-generation-reuse-model-mismatch',
        message:
          'A same-generation service frontend ticket cannot cross changed model or projection schemas',
        extra: {
          generationId: authorityGenerationId,
          requiredBump: compatibility.requiredBump,
          diffCount: compatibility.diffs.length,
        },
      });
    }
  }

  // Checkpoint 3: registration discovery happens before either actor-specific
  // stub lookup, so ticket-before-state cannot instantiate a partial target.
  const key = {
    generationId: authorityGenerationId,
    serviceName: props.serviceName,
    actorName: props.actorName,
    actorId,
    frontendName: props.frontendName,
  };
  const serviceFrontendRepoName =
    yield* ServiceFrontendRepo.repoUtils.nameUtils.makeName(key);
  const serviceFrontendBlockRepoName =
    yield* ServiceFrontendBlockRepo.repoUtils.nameUtils.makeName(key);
  const systemRepo = SystemRepo.getRepo({
    generationId: authorityGenerationId,
  });
  const serviceFrontendRegistrations = yield* makeAsync(() =>
    systemRepo.getRepoRegistrations({ repoType: 'ServiceFrontendRepo' }),
  ).pipe(Effect.flatMap(decodeRpc));
  const serviceFrontendBlockRegistrations = yield* makeAsync(() =>
    systemRepo.getRepoRegistrations({
      repoType: 'ServiceFrontendBlockRepo',
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  if (
    serviceFrontendRegistrations.find(
      registration => registration.repoName === serviceFrontendRepoName,
    ) === undefined ||
    serviceFrontendBlockRegistrations.find(
      registration => registration.repoName === serviceFrontendBlockRepoName,
    ) === undefined
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-state-required',
      message:
        'Service frontend state must initialize before a WebSocket ticket can be created',
      extra: {
        generationId: authorityGenerationId,
        serviceName: props.serviceName,
        actorName: props.actorName,
        actorId,
        frontendName: props.frontendName,
      },
    });
  }

  // Checkpoint 4: the ready projection supplies its exact bound and the archive
  // must already contain every ordinary or boundary row through that index.
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
  if (readiness.generationId !== authorityGenerationId) {
    return yield* new ZerospinError({
      code: 'service-frontend-ticket-readiness-generation-mismatch',
      message:
        'Service frontend ticket readiness belongs to another generation',
      extra: {
        generationId: authorityGenerationId,
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
          actorName: Schema.String,
          actorId: makeAbbreviationIdSchema(coreAbbreviations.actor),
          frontendName: Schema.String,
          terminalFrontendIndex: Schema.Number,
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
  )(descriptorUnknown).pipe(
    mapParseError({
      code: 'service-frontend-ticket-archive-descriptor-invalid',
      prefix: 'Failed to decode ServiceFrontendBlockRepo descriptor RPC',
    }),
  );
  const descriptor = yield* decodeRpc(descriptorEncoded);
  if (
    descriptor.systemId !== props.configuredSystemId ||
    descriptor.generationId !== authorityGenerationId ||
    descriptor.serviceName !== props.serviceName ||
    descriptor.actorName !== props.actorName ||
    descriptor.actorId !== actorId ||
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

  // Checkpoint 5: the target SystemRepo persists only the ticket hash and exact
  // target. The source generation receives neither state nor a ticket row.
  const ticket = yield* makeAsync(() =>
    systemRepo.createServiceFrontendWebSocketTicket({
      deployId: authorityDeployId,
      serviceName: props.serviceName,
      actorName: props.actorName,
      actorId,
      frontendName: props.frontendName,
      frontendVersion: authoritativeFrontendBinding.frontendController.version,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
  return {
    ticket,
    systemId: descriptor.systemId,
    generationId: authorityGenerationId,
    serviceName: props.serviceName,
    actorId,
    actorName: props.actorName,
    frontendName: props.frontendName,
    frontendVersion: authoritativeFrontendBinding.frontendController.version,
  };
});
