import { getFrontendController } from '@zerospin/core/accountController/getFrontendController';
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeEffectSchema } from '@zerospin/core/models/primitiveMaps';
import type {
  IAccountCursor,
  IAnyDrizzleSchemas,
} from '@zerospin/core/models/types';
import type {
  IFrontendLineageBlock,
  IFrontendSyncState,
} from '@zerospin/core/session/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { getTableName } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';

import { getActorBlockRepo } from '../../ActorBlockRepo/getActorBlockRepo/getActorBlockRepo.js';
import { getFrontendBlockRepo } from '../../FrontendBlockRepo/getFrontendBlockRepo/getFrontendBlockRepo.js';
import {
  getLastAccountCursor,
  getLastAccountIndex,
  setLastAccountCursor,
  setLastAccountIndex,
} from '../../getLastAccountCursor/getLastAccountCursor.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import { FRONTEND_INDEX_KV_KEY } from '../bootstrap/bootstrap.js';
import { frontendRepoDrizzleSchemas } from '../FrontendRepo.js';

/*
 * Installs one drained predecessor snapshot, catches up the target actor stream
 * without emitting target frontend blocks, and then archives one boundary.
 */
export const prepareSuccessor = Effect.fn('FrontendRepo.prepareSuccessor')(
  function* (props: {
    sourceState: IFrontendSyncState;
    lastAccountCursor: IAccountCursor | null;
    accountIndex: number | null;
    predecessor: Readonly<{
      generationId: string;
      repoName: string;
      terminalFrontendIndex: number;
    }>;
    configuredSystemId: string;
    db: IDb;
    key: {
      generationId: string;
      accountId: string;
      accountName: string;
      actorId: string;
      actorName: string;
      frontendName: string;
    };
    name: string;
    frontendRepoSchema: IAnyDrizzleSchemas;
    storage: DurableObjectStorage;
  }): Effect.fn.Return<void, IAnyError, Async> {
    const {
      accountIndex,
      db,
      key,
      lastAccountCursor,
      name,
      frontendRepoSchema,
      predecessor,
      sourceState,
      storage,
    } = props;
    const systemId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.system),
    )(props.configuredSystemId).pipe(
      mapParseError({
        code: 'frontend-successor-system-id-invalid',
        prefix: 'Failed to decode configured successor systemId',
      }),
    );
    const generationId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.generation),
    )(key.generationId).pipe(
      mapParseError({
        code: 'frontend-successor-generation-id-invalid',
        prefix: 'Failed to decode successor generationId',
      }),
    );
    const accountId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.account),
    )(key.accountId).pipe(
      mapParseError({
        code: 'frontend-successor-account-id-invalid',
        prefix: 'Failed to decode successor accountId',
      }),
    );
    const actorId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.actor),
    )(key.actorId).pipe(
      mapParseError({
        code: 'frontend-successor-actor-id-invalid',
        prefix: 'Failed to decode successor actorId',
      }),
    );
    const predecessorGenerationId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.generation),
    )(predecessor.generationId).pipe(
      mapParseError({
        code: 'frontend-successor-predecessor-generation-invalid',
        prefix: 'Failed to decode predecessor generationId',
      }),
    );
    if (
      predecessorGenerationId === generationId ||
      !Number.isInteger(predecessor.terminalFrontendIndex) ||
      predecessor.terminalFrontendIndex < 0 ||
      sourceState.systemId !== systemId ||
      sourceState.generationId !== predecessorGenerationId ||
      sourceState.accountId !== accountId ||
      sourceState.accountName !== key.accountName ||
      sourceState.actorId !== actorId ||
      sourceState.actorName !== key.actorName ||
      sourceState.frontendName !== key.frontendName ||
      sourceState.frontendIndex !== predecessor.terminalFrontendIndex ||
      sourceState.pushedCommands.length !== 0 ||
      (lastAccountCursor === null) !== (accountIndex === null) ||
      (accountIndex !== null &&
        (!Number.isInteger(accountIndex) || accountIndex < 1))
    ) {
      return yield* new ZerospinError({
        code: 'frontend-successor-source-mismatch',
        message:
          'Frontend successor source state, settled command state, causal watermark, and predecessor descriptor must identify one exact logical frontend',
      });
    }

    const frontendController = yield* getFrontendController({
      system,
      accountName: key.accountName,
      actorName: key.actorName,
      frontendName: key.frontendName,
    });
    const initialized = storage.kv.get('initialized');
    const boundaryFrontendIndex = predecessor.terminalFrontendIndex + 1;
    if (initialized === undefined) {
      yield* makeTx({
        db,
        program: Effect.fn('FrontendRepo.prepareSuccessor.installSnapshot')(
          function* ({ tx }) {
            for (const resource of sourceState.resources) {
              const model = yield* getByKeyOrThrow({
                record: frontendController.models,
                key: resource.modelName,
                recordKind: 'frontend models',
              });
              const decodedResource = yield* Schema.validate(
                EncodedResourceSchema,
              )(resource).pipe(
                mapParseError({
                  code: 'frontend-successor-resource-invalid',
                  prefix: `Failed to decode successor resource ${resource.modelName}.${resource.id}`,
                }),
              );
              yield* Schema.decodeUnknown(
                makeEffectSchema(model.propertiesShape),
              )(decodedResource, { onExcessProperty: 'error' }).pipe(
                mapParseError({
                  code: 'frontend-successor-model-resource-invalid',
                  prefix: `Successor resource does not match model ${resource.modelName}`,
                }),
              );
              tx.insert(model.drizzleSchema).values(decodedResource).run();
              tx.insert(frontendRepoDrizzleSchemas.graph)
                .values({
                  resourceId: decodedResource.id,
                  modelName: decodedResource.modelName,
                })
                .run();
            }
            for (const command of sourceState.executedPushedCommands) {
              tx.insert(frontendRepoDrizzleSchemas.executedPushedCommands)
                .values(command)
                .run();
            }
            for (const command of sourceState.failedPushedCommands) {
              tx.insert(frontendRepoDrizzleSchemas.failedPushedCommands)
                .values(command)
                .run();
            }
            yield* setLastAccountCursor({
              storage,
              tx,
              accountCursor: lastAccountCursor,
            });
            yield* setLastAccountIndex({
              storage,
              tx,
              accountIndex,
            });
            storage.kv.put(
              FRONTEND_INDEX_KV_KEY,
              predecessor.terminalFrontendIndex,
            );
            storage.kv.put('emissionMode', 'no-emission');
            storage.kv.put('segmentKind', 'inherited');
            storage.kv.put('predecessorGenerationId', predecessorGenerationId);
            storage.kv.put('predecessorRepoName', predecessor.repoName);
            storage.kv.put(
              'predecessorTerminalFrontendIndex',
              predecessor.terminalFrontendIndex,
            );
            storage.kv.put('systemWorkerName', sourceState.systemWorkerName);
            if (sourceState.lastRebasedPushedCursor === null) {
              storage.kv.delete('lastRebasedPushedCursor');
            } else {
              storage.kv.put(
                'lastRebasedPushedCursor',
                sourceState.lastRebasedPushedCursor,
              );
            }
            storage.kv.put('initialized', true);
          },
        ),
      });
    } else if (initialized !== true) {
      return yield* new ZerospinError({
        code: 'frontend-successor-initialization-marker-invalid',
        message: 'FrontendRepo initialized marker must be true when present',
      });
    }

    const storedSegmentKind = yield* Schema.decodeUnknown(
      Schema.Literal('inherited'),
    )(storage.kv.get('segmentKind')).pipe(
      mapParseError({
        code: 'frontend-successor-segment-kind-conflict',
        prefix: 'Stored FrontendRepo segment does not match successor retry',
      }),
    );
    const storedPredecessorGenerationId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.generation),
    )(storage.kv.get('predecessorGenerationId')).pipe(
      mapParseError({
        code: 'frontend-successor-predecessor-generation-conflict',
        prefix: 'Stored predecessor generation does not match successor retry',
      }),
    );
    const storedPredecessorRepoName = yield* Schema.decodeUnknown(
      Schema.String,
    )(storage.kv.get('predecessorRepoName')).pipe(
      mapParseError({
        code: 'frontend-successor-predecessor-repo-conflict',
        prefix: 'Stored predecessor repo does not match successor retry',
      }),
    );
    const storedPredecessorTerminalFrontendIndex = yield* Schema.decodeUnknown(
      Schema.Number,
    )(storage.kv.get('predecessorTerminalFrontendIndex')).pipe(
      mapParseError({
        code: 'frontend-successor-predecessor-index-conflict',
        prefix: 'Stored predecessor index does not match successor retry',
      }),
    );
    const storedSystemWorkerName = yield* Schema.decodeUnknown(Schema.String)(
      storage.kv.get('systemWorkerName'),
    ).pipe(
      mapParseError({
        code: 'frontend-successor-system-worker-name-conflict',
        prefix: 'Stored system worker identity does not match successor retry',
      }),
    );
    const emissionMode = yield* Schema.decodeUnknown(
      Schema.Literal('no-emission', 'live'),
    )(storage.kv.get('emissionMode')).pipe(
      mapParseError({
        code: 'frontend-successor-emission-mode-conflict',
        prefix: 'Stored emission mode does not match successor preparation',
      }),
    );
    const frontendIndex = yield* Schema.decodeUnknown(Schema.Number)(
      storage.kv.get(FRONTEND_INDEX_KV_KEY),
    ).pipe(
      mapParseError({
        code: 'frontend-successor-index-conflict',
        prefix: 'Stored frontend index does not match successor preparation',
      }),
    );
    if (
      storedSegmentKind !== 'inherited' ||
      storedPredecessorGenerationId !== predecessorGenerationId ||
      storedPredecessorRepoName !== predecessor.repoName ||
      storedPredecessorTerminalFrontendIndex !==
        predecessor.terminalFrontendIndex ||
      storedSystemWorkerName !== sourceState.systemWorkerName ||
      (emissionMode === 'no-emission' &&
        frontendIndex !== predecessor.terminalFrontendIndex) ||
      (emissionMode === 'live' && frontendIndex !== boundaryFrontendIndex)
    ) {
      return yield* new ZerospinError({
        code: 'frontend-successor-state-conflict',
        message:
          'Existing FrontendRepo state does not match this successor preparation retry',
      });
    }

    const frontendBlockRepo = yield* getFrontendBlockRepo({ key });
    const recordUnknown = yield* makeAsync(() =>
      frontendBlockRepo.recordPredecessor({
        systemId,
        predecessor,
      }),
    );
    const recordEncoded = yield* Schema.decodeUnknown(
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
    )(recordUnknown).pipe(
      mapParseError({
        code: 'frontend-successor-predecessor-rpc-invalid',
        prefix: 'Failed to decode successor predecessor RPC',
      }),
    );
    yield* decodeRpc(recordEncoded);

    if (emissionMode === 'no-emission') {
      const actorBlockRepo = yield* getActorBlockRepo({
        key: {
          generationId: key.generationId,
          accountId: key.accountId,
          accountName: key.accountName,
          actorId: key.actorId,
          actorName: key.actorName,
        },
      });
      const subscribedEncoded = yield* makeAsync(() =>
        actorBlockRepo.subscribeFrontend({
          frontendRepoName: name,
          frontendName: key.frontendName,
          currentAccountCursor: lastAccountCursor,
          currentAccountIndex: accountIndex,
        }),
      );
      yield* decodeRpc(subscribedEncoded);
      const drainedEncoded = yield* makeAsync(() =>
        actorBlockRepo.drainFrontendSubscribers(),
      );
      yield* decodeRpc(drainedEncoded);

      const caughtUpFrontendIndex = storage.kv.get(FRONTEND_INDEX_KV_KEY);
      if (caughtUpFrontendIndex !== predecessor.terminalFrontendIndex) {
        return yield* new ZerospinError({
          code: 'frontend-successor-no-emission-violated',
          message:
            'Successor catch-up changed the logical frontend index while no-emission mode was active',
        });
      }
      const caughtUpCursor = yield* getLastAccountCursor({
        storage,
        defaultValue: null,
      });
      const caughtUpIndex = yield* getLastAccountIndex({
        storage,
        defaultValue: null,
      });
      if ((caughtUpCursor === null) !== (caughtUpIndex === null)) {
        return yield* new ZerospinError({
          code: 'frontend-successor-causal-watermark-incomplete',
          message:
            'Successor catch-up produced an incomplete account causal watermark',
        });
      }

      const boundary = {
        kind: 'generation-boundary',
        systemId,
        prevGenerationId: predecessorGenerationId,
        generationId,
        accountId,
        accountName: key.accountName,
        actorId,
        actorName: key.actorName,
        frontendName: key.frontendName,
        frontendIndex: boundaryFrontendIndex,
      } satisfies IFrontendLineageBlock;
      const boundaryUnknown = yield* makeAsync(() =>
        frontendBlockRepo.storeFrontendBlocks({ blocks: [boundary] }),
      );
      const boundaryEncoded = yield* Schema.decodeUnknown(
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
      )(boundaryUnknown).pipe(
        mapParseError({
          code: 'frontend-successor-boundary-rpc-invalid',
          prefix: 'Failed to decode successor boundary archive RPC',
        }),
      );
      yield* decodeRpc(boundaryEncoded);
      storage.kv.put(FRONTEND_INDEX_KV_KEY, boundaryFrontendIndex);
      storage.kv.put('emissionMode', 'live');
    }
    storage.kv.put('subscribed', true);

    yield* makeAsync(() =>
      SystemRepo.getRepo({ generationId: key.generationId }).registerRepo({
        registration: {
          repoType: 'FrontendRepo',
          repoName: name,
          tableNames: Object.values(frontendRepoSchema).map(getTableName),
        },
      }),
    ).pipe(Effect.flatMap(decodeRpc));
  },
);
