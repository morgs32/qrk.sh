import { getFrontendController } from '@zerospin/core/accountController/getFrontendController';
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type {
  IAccountId,
  IActorId,
  IAnyDrizzleSchemas,
  IEncodedResourceShape,
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
} from '../../getLastAccountCursor/getLastAccountCursor.js';
import { SystemRepo } from '../../SystemRepo/SystemRepo.js';
import { bootstrap, FRONTEND_INDEX_KV_KEY } from '../bootstrap/bootstrap.js';
import { frontendRepoDrizzleSchemas } from '../FrontendRepo.js';

export const getFrontendState = Effect.fn('FrontendRepo.getFrontendState')(
  function* (props: {
    accountId: string;
    accountName: string;
    actorId: string;
    actorName: string;
    frontendName: string;
    systemWorkerName: string;
    configuredSystemId: string;
    key: {
      generationId: string;
      accountId: string;
      accountName: string;
      actorId: string;
      actorName: string;
      frontendName: string;
    };
    name: string;
    db: IDb;
    frontendRepoSchema: IAnyDrizzleSchemas;
    storage: DurableObjectStorage;
    lineage: Readonly<{
      mode: 'live' | 'no-local-segment';
      predecessor: Readonly<{
        generationId: string;
        repoName: string;
        terminalFrontendIndex: number;
      }> | null;
    }>;
  }): Effect.fn.Return<IFrontendSyncState, IAnyError, Async> {
    const {
      configuredSystemId,
      db,
      frontendRepoSchema,
      key,
      lineage,
      name,
      storage,
      systemWorkerName,
    } = props;
    const systemId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.system),
    )(configuredSystemId).pipe(
      mapParseError({
        code: 'frontend-state-system-id-invalid',
        prefix: 'Failed to decode configured frontend systemId',
      }),
    );
    const generationId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.generation),
    )(key.generationId).pipe(
      mapParseError({
        code: 'frontend-state-generation-id-invalid',
        prefix: 'Failed to decode FrontendRepo generationId',
      }),
    );
    const accountId: IAccountId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.account),
    )(key.accountId).pipe(
      mapParseError({
        code: 'frontend-state-account-id-invalid',
        prefix: 'Failed to decode FrontendRepo accountId',
      }),
    );
    const actorId: IActorId = yield* Schema.decodeUnknown(
      makeAbbreviationIdSchema(coreAbbreviations.actor),
    )(key.actorId).pipe(
      mapParseError({
        code: 'frontend-state-actor-id-invalid',
        prefix: 'Failed to decode FrontendRepo actorId',
      }),
    );
    if (
      props.accountId !== accountId ||
      props.accountName !== key.accountName ||
      props.actorId !== actorId ||
      props.actorName !== key.actorName ||
      props.frontendName !== key.frontendName ||
      systemWorkerName.length === 0 ||
      name.length === 0
    ) {
      return yield* new ZerospinError({
        code: 'frontend-state-target-mismatch',
        message:
          'Frontend state request does not match its bound repository target',
      });
    }
    yield* bootstrap({ key, name, db, storage, lineage });
    const storedSystemWorkerName = storage.kv.get('systemWorkerName');
    if (storedSystemWorkerName === undefined) {
      storage.kv.put('systemWorkerName', systemWorkerName);
    } else if (storedSystemWorkerName !== systemWorkerName) {
      return yield* new ZerospinError({
        code: 'frontend-state-system-worker-name-mismatch',
        message:
          'Stored FrontendRepo system worker name does not match this request',
      });
    }
    const frontendController = yield* getFrontendController({
      system,
      accountName: key.accountName,
      actorName: key.actorName,
      frontendName: key.frontendName,
    });

    const segmentKind = yield* Schema.decodeUnknown(
      Schema.Literal('root', 'inherited', 'no-local-segment'),
    )(storage.kv.get('segmentKind')).pipe(
      mapParseError({
        code: 'frontend-state-segment-kind-invalid',
        prefix: 'Failed to decode FrontendRepo segment kind',
      }),
    );

    // A projection admitted after freeze is a snapshot-only materialization.
    // It has no subscriber, local archive, registration, or ticket path.
    if (segmentKind === 'no-local-segment') {
      const readOnlyEmissionMode = yield* Schema.decodeUnknown(
        Schema.Literal('read-only'),
      )(storage.kv.get('emissionMode')).pipe(
        mapParseError({
          code: 'frontend-state-read-only-emission-mode-invalid',
          prefix: 'Failed to decode snapshot-only FrontendRepo emission mode',
        }),
      );
      const snapshotOnlyFrontendIndex = yield* Schema.decodeUnknown(
        Schema.Number,
      )(storage.kv.get(FRONTEND_INDEX_KV_KEY)).pipe(
        mapParseError({
          code: 'frontend-state-read-only-index-invalid',
          prefix: 'Failed to decode snapshot-only FrontendRepo index',
        }),
      );
      if (
        lineage.mode !== 'no-local-segment' ||
        readOnlyEmissionMode !== 'read-only' ||
        snapshotOnlyFrontendIndex !==
          (lineage.predecessor?.terminalFrontendIndex ?? 0) ||
        storage.kv.get('subscribed') !== undefined
      ) {
        return yield* new ZerospinError({
          code: 'frontend-state-no-local-segment-conflict',
          message:
            'Snapshot-only FrontendRepo state does not match its frozen classification',
        });
      }
    } else {
      const frontendBlockRepo = yield* getFrontendBlockRepo({ key });
      const recordPredecessorUnknown = yield* makeAsync(() =>
        frontendBlockRepo.recordPredecessor({
          systemId,
          predecessor: lineage.predecessor,
        }),
      );
      const recordPredecessorEncoded = yield* Schema.decodeUnknown(
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
      )(recordPredecessorUnknown).pipe(
        mapParseError({
          code: 'frontend-record-lineage-rpc-invalid',
          prefix: 'Failed to decode FrontendBlockRepo lineage RPC',
        }),
      );
      yield* decodeRpc(recordPredecessorEncoded);

      const emissionMode = yield* Schema.decodeUnknown(
        Schema.Literal('live', 'no-emission'),
      )(storage.kv.get('emissionMode')).pipe(
        mapParseError({
          code: 'frontend-state-emission-mode-invalid',
          prefix: 'Failed to decode FrontendRepo emission mode',
        }),
      );
      const storedFrontendIndex = yield* Schema.decodeUnknown(Schema.Number)(
        storage.kv.get(FRONTEND_INDEX_KV_KEY),
      ).pipe(
        mapParseError({
          code: 'frontend-state-index-invalid',
          prefix: 'Failed to decode FrontendRepo frontend index',
        }),
      );
      if (segmentKind === 'inherited') {
        if (lineage.predecessor === null) {
          return yield* new ZerospinError({
            code: 'frontend-state-predecessor-required',
            message: 'Inherited FrontendRepo state requires a predecessor',
          });
        }
        const boundaryFrontendIndex =
          lineage.predecessor.terminalFrontendIndex + 1;
        if (
          emissionMode === 'no-emission' &&
          storedFrontendIndex === lineage.predecessor.terminalFrontendIndex
        ) {
          const boundary = {
            kind: 'generation-boundary',
            systemId,
            prevGenerationId: lineage.predecessor.generationId,
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
              code: 'frontend-state-boundary-rpc-invalid',
              prefix: 'Failed to decode FrontendBlockRepo boundary RPC',
            }),
          );
          yield* decodeRpc(boundaryEncoded);
          storage.kv.put(FRONTEND_INDEX_KV_KEY, boundaryFrontendIndex);
          storage.kv.put('emissionMode', 'live');
        } else if (
          emissionMode !== 'live' ||
          storedFrontendIndex < boundaryFrontendIndex
        ) {
          return yield* new ZerospinError({
            code: 'frontend-state-inherited-index-conflict',
            message:
              'Inherited FrontendRepo state does not match its boundary index',
          });
        }
      } else if (
        lineage.predecessor !== null ||
        emissionMode !== 'live' ||
        storedFrontendIndex < 0
      ) {
        return yield* new ZerospinError({
          code: 'frontend-state-root-lineage-conflict',
          message: 'Root FrontendRepo state cannot have inherited lineage',
        });
      }

      if (storage.kv.get('subscribed') !== true) {
        const currentAccountCursor = yield* getLastAccountCursor({
          storage,
          defaultValue: null,
        });
        const currentAccountIndex = yield* getLastAccountIndex({
          storage,
          defaultValue: null,
        });
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
            currentAccountCursor,
            currentAccountIndex,
          }),
        );
        yield* decodeRpc(subscribedEncoded);
        storage.kv.put('subscribed', true);
      }

      yield* makeAsync(() =>
        SystemRepo.getRepo({ generationId: key.generationId }).registerRepo({
          registration: {
            repoType: 'FrontendRepo',
            repoName: name,
            tableNames: Object.values(frontendRepoSchema).map(getTableName),
          },
        }),
      ).pipe(Effect.flatMap(decodeRpc));
    }
    const resources: IEncodedResourceShape[] = [];
    for (const modelName of Object.keys(frontendController.models)) {
      const model = yield* getByKeyOrThrow({
        record: frontendController.models,
        key: modelName,
        recordKind: 'frontend models',
      });
      for (const row of db.select().from(model.drizzleSchema).all()) {
        resources.push(row as IEncodedResourceShape);
      }
    }
    const frontendIndex = storage.kv.get(FRONTEND_INDEX_KV_KEY);
    const lastRebasedPushedCursor = yield* Schema.decodeUnknown(
      Schema.UndefinedOr(
        makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
      ),
    )(storage.kv.get('lastRebasedPushedCursor')).pipe(
      mapParseError({
        code: 'frontend-repo-invalid-last-rebased-pushed-cursor',
        prefix: 'Failed to decode FrontendRepo pushed rebase watermark',
      }),
    );
    return {
      accountId,
      actorId,
      systemId,
      generationId,
      systemVersion: system.version,
      accountName: key.accountName,
      actorName: key.actorName,
      frontendName: key.frontendName,
      systemWorkerName,
      frontendIndex: typeof frontendIndex === 'number' ? frontendIndex : 0,
      lastRebasedPushedCursor: lastRebasedPushedCursor ?? null,
      pushedCommands: db
        .select()
        .from(frontendRepoDrizzleSchemas.pushedCommands)
        .all(),
      resources,
      executedPushedCommands: db
        .select()
        .from(frontendRepoDrizzleSchemas.executedPushedCommands)
        .all(),
      failedPushedCommands: db
        .select()
        .from(frontendRepoDrizzleSchemas.failedPushedCommands)
        .all(),
    };
  },
);
