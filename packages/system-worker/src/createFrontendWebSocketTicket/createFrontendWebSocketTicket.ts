/*
 * System-worker annotation:
 * Resolves the authenticated frontend projection to its authoritative
 * generation archive and asks only that generation's SystemRepo to mint the
 * admission capability.
 */

import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IAccountId, IActorId } from '@zerospin/core/models/types';
import { checkSystemCompatibility } from '@zerospin/core/system/checkSystemCompatibility';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { FrontendBlockRepo } from '../FrontendBlockRepo/FrontendBlockRepo.js';
import { getFrontendBlockRepo } from '../FrontendBlockRepo/getFrontendBlockRepo/getFrontendBlockRepo.js';
import { FrontendRepo } from '../FrontendRepo/FrontendRepo.js';
import { getFrontendRepo } from '../FrontendRepo/getFrontendRepo/getFrontendRepo.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

export const createFrontendWebSocketTicket = Effect.fn(
  'SystemWorker.createFrontendWebSocketTicket',
  { root: true },
)(function* (props: {
  deployId: string;
  generationId: string;
  accountId: IAccountId;
  accountName: string;
  actorId: IActorId;
  actorName: string;
  frontendName: string;
  configuredSystemId: string;
}) {
  // Checkpoint 1: resolve authority from the bound generation. State and push
  // never cross this boundary, but ticket minting follows only the durable
  // successor relation and verifies the inverse predecessor on every hop.
  const runtimeSystemSpec = makeSystemSpec({ system });
  const sourceFrontendBinding =
    runtimeSystemSpec.accountControllers[props.accountName]?.actorControllers[
      props.actorName
    ]?.frontends[props.frontendName];
  if (sourceFrontendBinding === undefined) {
    return yield* new ZerospinError({
      code: 'frontend-identity-changed',
      message:
        'The bound SystemWorker no longer defines the authenticated frontend identity',
      extra: {
        generationId: props.generationId,
        accountName: props.accountName,
        actorName: props.actorName,
        frontendName: props.frontendName,
      },
    });
  }

  const sourceSystemRepo = SystemRepo.getRepo({
    generationId: props.generationId,
  });
  const sourceGenerationState = yield* makeAsync(() =>
    sourceSystemRepo.getGenerationState(),
  ).pipe(Effect.flatMap(decodeRpc));
  if (sourceGenerationState === null) {
    return yield* new ZerospinError({
      code: 'frontend-ticket-authority-generation-missing',
      message:
        'The bound frontend generation has no authoritative lifecycle state',
      extra: { generationId: props.generationId },
    });
  }
  if (sourceGenerationState.generationId !== props.generationId) {
    return yield* new ZerospinError({
      code: 'frontend-ticket-authority-generation-mismatch',
      message:
        'The bound frontend generation does not match its authoritative lifecycle state',
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
        code: 'frontend-ticket-successor-chain-incomplete',
        message:
          'A drained frontend generation has incomplete successor lifecycle state',
        extra: { generationId: authorityGenerationId },
      });
    }

    const successorGenerationId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.generation),
    )(authorityGenerationState.successorGenerationId).pipe(
      mapParseError({
        code: 'frontend-ticket-successor-generation-invalid',
        prefix: 'Recorded frontend successor generation is invalid',
        extra: { generationId: authorityGenerationId },
      }),
    );
    if (visitedGenerationIds.has(successorGenerationId)) {
      return yield* new ZerospinError({
        code: 'frontend-ticket-successor-cycle',
        message: 'The recorded frontend successor chain contains a cycle',
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
        code: 'frontend-ticket-successor-generation-missing',
        message:
          'A recorded frontend successor has no authoritative lifecycle state',
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
        code: 'frontend-ticket-successor-chain-mismatch',
        message:
          'The recorded frontend successor does not point back to its predecessor generation',
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
      code: 'frontend-ticket-authority-not-open',
      message:
        'The authoritative frontend generation is not ready with read admission',
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
      code: 'frontend-ticket-authority-system-mismatch',
      message:
        'The authoritative frontend successor belongs to a different system identity',
      extra: {
        generationId: authorityGenerationId,
        systemName: runtimeSystemSpec.systemName,
        authoritativeSystemName: authoritySystemSpec.systemName,
      },
    });
  }

  const authoritativeFrontendBinding =
    authoritySystemSpec.accountControllers[props.accountName]?.actorControllers[
      props.actorName
    ]?.frontends[props.frontendName];
  if (
    authoritativeFrontendBinding === undefined ||
    authoritativeFrontendBinding.frontendController.accountName !==
      props.accountName ||
    authoritativeFrontendBinding.frontendController.actorName !==
      props.actorName ||
    authoritativeFrontendBinding.frontendController.frontendName !==
      props.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'frontend-identity-changed',
      message:
        'The authoritative generation does not contain the bound frontend identity',
      extra: {
        generationId: authorityGenerationId,
        accountName: props.accountName,
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
        code: 'frontend-ticket-generation-reuse-model-mismatch',
        message:
          'A same-generation frontend ticket cannot cross changed model or projection schemas',
        extra: {
          generationId: authorityGenerationId,
          requiredBump: compatibility.requiredBump,
          diffCount: compatibility.diffs.length,
        },
      });
    }
  }

  // Checkpoint 2: derive the sole authoritative durable-object target after the
  // successor chain is proven. Ticket-before-state cannot instantiate either
  // half of the target projection/archive pair.
  const repoName = yield* FrontendBlockRepo.repoUtils.nameUtils.makeName({
    generationId: authorityGenerationId,
    accountId: props.accountId,
    accountName: props.accountName,
    actorId: props.actorId,
    actorName: props.actorName,
    frontendName: props.frontendName,
  });
  const frontendRepoName = yield* FrontendRepo.repoUtils.nameUtils.makeName({
    generationId: authorityGenerationId,
    accountId: props.accountId,
    accountName: props.accountName,
    actorId: props.actorId,
    actorName: props.actorName,
    frontendName: props.frontendName,
  });
  const systemRepo = SystemRepo.getRepo({
    generationId: authorityGenerationId,
  });

  const frontendRegistrations = yield* makeAsync(() =>
    systemRepo.getRepoRegistrations({ repoType: 'FrontendRepo' }),
  ).pipe(Effect.flatMap(decodeRpc));
  const frontendBlockRegistrations = yield* makeAsync(() =>
    systemRepo.getRepoRegistrations({ repoType: 'FrontendBlockRepo' }),
  ).pipe(Effect.flatMap(decodeRpc));
  if (
    frontendRegistrations.find(
      registration => registration.repoName === frontendRepoName,
    ) === undefined ||
    frontendBlockRegistrations.find(
      registration => registration.repoName === repoName,
    ) === undefined
  ) {
    return yield* new ZerospinError({
      code: 'frontend-state-required',
      message:
        'Frontend state must initialize a real local segment before a WebSocket ticket can be created',
      extra: {
        generationId: authorityGenerationId,
        accountId: props.accountId,
        actorId: props.actorId,
        frontendName: props.frontendName,
      },
    });
  }

  // Checkpoint 3: the projection watermark is usable for admission only when
  // its immutable, version-independent archive covers that exact index.
  const frontendRepo = yield* getFrontendRepo({
    key: {
      generationId: authorityGenerationId,
      accountId: props.accountId,
      accountName: props.accountName,
      actorId: props.actorId,
      actorName: props.actorName,
      frontendName: props.frontendName,
    },
  });
  const readinessEncoded = yield* makeAsync(() =>
    frontendRepo.getProjectionReadiness(),
  );
  const readiness = yield* decodeRpc(readinessEncoded);
  if (readiness.generationId !== authorityGenerationId) {
    return yield* new ZerospinError({
      code: 'frontend-ticket-readiness-generation-mismatch',
      message: 'Frontend ticket readiness belongs to another generation',
      extra: {
        generationId: authorityGenerationId,
        readinessGenerationId: readiness.generationId,
      },
    });
  }

  const frontendBlockRepo = yield* getFrontendBlockRepo({
    key: {
      generationId: authorityGenerationId,
      accountId: props.accountId,
      accountName: props.accountName,
      actorId: props.actorId,
      actorName: props.actorName,
      frontendName: props.frontendName,
    },
  });
  const descriptorUnknown = yield* makeAsync(() =>
    frontendBlockRepo.getPredecessor(),
  );
  const descriptorEncoded = yield* Schema.decodeUnknown(
    Schema.Union(
      Schema.Struct({
        _tag: Schema.Literal('Right'),
        right: Schema.Struct({
          systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
          generationId: Schema.String,
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
      code: 'frontend-ticket-archive-descriptor-invalid',
      prefix: 'Failed to decode FrontendBlockRepo descriptor RPC',
    }),
  );
  const descriptor = yield* decodeRpc(descriptorEncoded);
  if (
    descriptor.systemId !== props.configuredSystemId ||
    descriptor.generationId !== authorityGenerationId ||
    descriptor.terminalFrontendIndex < readiness.frontendIndex
  ) {
    return yield* new ZerospinError({
      code: 'frontend-ticket-archive-target-mismatch',
      message: 'Frontend ticket target is not covered by its immutable archive',
    });
  }
  const archiveReadinessUnknown = yield* makeAsync(() =>
    frontendBlockRepo.assertArchiveThrough({
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
      code: 'frontend-ticket-archive-readiness-invalid',
      prefix: 'Failed to decode FrontendBlockRepo readiness RPC',
    }),
  );
  yield* decodeRpc(archiveReadinessEncoded);

  // Checkpoint 4: the authoritative SystemRepo owns admission, expiry, hashing,
  // and one-use state. The source generation never receives a target ticket row.
  const encoded = yield* makeAsync(() =>
    systemRepo.createFrontendWebSocketTicket({
      deployId: authorityDeployId,
      repoName,
      frontendVersion: authoritativeFrontendBinding.frontendController.version,
    }),
  );
  const ticket = yield* decodeRpc(encoded);
  return {
    ticket,
    systemId: descriptor.systemId,
    generationId: authorityGenerationId,
    accountId: props.accountId,
    accountName: props.accountName,
    actorId: props.actorId,
    actorName: props.actorName,
    frontendName: props.frontendName,
    frontendVersion: authoritativeFrontendBinding.frontendController.version,
  };
});
