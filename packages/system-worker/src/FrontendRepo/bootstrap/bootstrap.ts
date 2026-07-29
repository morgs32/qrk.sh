import { getFrontendBinding } from '@zerospin/core/accountController/getFrontendBinding';
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { upsertHelper } from '@zerospin/core/drizzle/upsertHelper';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  ZerospinError,
  type IAnyError,
  type IAnyErrorJson,
} from '@zerospin/error';
import { Effect, type Schema } from 'effect';
import { system } from 'system';

import { getActorRepo } from '../../ActorRepo/getActorRepo/getActorRepo.js';
import {
  setLastAccountCursor,
  setLastAccountIndex,
} from '../../getLastAccountCursor/getLastAccountCursor.js';
import { frontendRepoDrizzleSchemas } from '../FrontendRepo.js';

const INITIALIZED_KV_KEY = 'initialized';
export const FRONTEND_INDEX_KV_KEY = 'frontendIndex';

export const bootstrap = Effect.fn('FrontendRepo.bootstrap')(function* (props: {
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
  storage: DurableObjectStorage;
  lineage: Readonly<{
    mode: 'live' | 'no-local-segment';
    predecessor: Readonly<{
      generationId: string;
      repoName: string;
      terminalFrontendIndex: number;
    }> | null;
  }>;
}): Effect.fn.Return<void, IAnyError, Async> {
  const { db, key, lineage, storage } = props;
  const expectedSegmentKind =
    lineage.mode === 'no-local-segment'
      ? 'no-local-segment'
      : lineage.predecessor === null
        ? 'root'
        : 'inherited';
  const initialized = storage.kv.get(INITIALIZED_KV_KEY);
  if (initialized === true) {
    const storedSegmentKind = storage.kv.get('segmentKind');
    const storedPredecessorGenerationId =
      storage.kv.get('predecessorGenerationId') ?? null;
    const storedPredecessorRepoName =
      storage.kv.get('predecessorRepoName') ?? null;
    const storedPredecessorTerminalFrontendIndex =
      storage.kv.get('predecessorTerminalFrontendIndex') ?? null;
    if (
      storedSegmentKind !== expectedSegmentKind ||
      storedPredecessorGenerationId !==
        (lineage.predecessor?.generationId ?? null) ||
      storedPredecessorRepoName !== (lineage.predecessor?.repoName ?? null) ||
      storedPredecessorTerminalFrontendIndex !==
        (lineage.predecessor?.terminalFrontendIndex ?? null)
    ) {
      return yield* new ZerospinError({
        code: 'frontend-bootstrap-lineage-conflict',
        message: 'Stored FrontendRepo lineage does not match this state retry',
        extra: {
          generationId: key.generationId,
          accountId: key.accountId,
          actorId: key.actorId,
          frontendName: key.frontendName,
          expectedSegmentKind,
          storedSegmentKind,
        },
      });
    }
    return;
  }
  if (initialized !== undefined) {
    return yield* new ZerospinError({
      code: 'frontend-bootstrap-initialized-marker-invalid',
      message: 'FrontendRepo initialized marker must be true when present',
    });
  }
  if (
    lineage.predecessor !== null &&
    (lineage.predecessor.generationId === key.generationId ||
      lineage.predecessor.repoName.length === 0 ||
      !Number.isInteger(lineage.predecessor.terminalFrontendIndex) ||
      lineage.predecessor.terminalFrontendIndex < 0)
  ) {
    return yield* new ZerospinError({
      code: 'frontend-bootstrap-predecessor-invalid',
      message:
        'FrontendRepo predecessor must identify an older archive and non-negative terminal index',
    });
  }

  const actorRepo = yield* getActorRepo({
    key: {
      generationId: key.generationId,
      accountId: key.accountId,
      accountName: key.accountName,
      actorId: key.actorId,
      actorName: key.actorName,
    },
  });
  const accountCursor = yield* makeAsync(() =>
    actorRepo.getLastAccountCursor(),
  ).pipe(Effect.flatMap(decodeRpc));
  const accountIndex = yield* makeAsync(() =>
    actorRepo.getLastAccountIndex(),
  ).pipe(Effect.flatMap(decodeRpc));
  const frontendBinding = yield* getFrontendBinding({
    system,
    accountName: key.accountName,
    actorName: key.actorName,
    frontendName: key.frontendName,
  });

  for (const model of Object.values(frontendBinding.models)) {
    const resources = yield* makeAsync<
      Schema.EitherEncoded<readonly IEncodedResourceShape[], IAnyErrorJson>
    >(() =>
      actorRepo.dumpActorModelResources({
        accountName: key.accountName,
        actorName: key.actorName,
        modelName: model.modelName,
      }),
    ).pipe(Effect.flatMap(decodeRpc));
    for (const resource of resources) {
      upsertHelper({
        table: model.drizzleSchema,
        tx: db as never,
        values: resource as never,
      });
      db.insert(frontendRepoDrizzleSchemas.graph)
        .values({ resourceId: resource.id, modelName: resource.modelName })
        .onConflictDoUpdate({
          target: frontendRepoDrizzleSchemas.graph.resourceId,
          set: { modelName: resource.modelName },
        })
        .run();
    }
  }

  if (accountCursor !== null) {
    yield* setLastAccountCursor({
      storage,
      tx: db as never,
      accountCursor,
    });
  }
  if (accountIndex !== null) {
    yield* setLastAccountIndex({
      storage,
      tx: db as never,
      accountIndex,
    });
  }
  storage.kv.put(
    FRONTEND_INDEX_KV_KEY,
    lineage.predecessor?.terminalFrontendIndex ?? 0,
  );
  storage.kv.put(
    'emissionMode',
    lineage.mode === 'no-local-segment'
      ? 'read-only'
      : lineage.predecessor === null
        ? 'live'
        : 'no-emission',
  );
  storage.kv.put('segmentKind', expectedSegmentKind);
  if (lineage.predecessor === null) {
    storage.kv.delete('predecessorGenerationId');
    storage.kv.delete('predecessorRepoName');
    storage.kv.delete('predecessorTerminalFrontendIndex');
  } else {
    storage.kv.put('predecessorGenerationId', lineage.predecessor.generationId);
    storage.kv.put('predecessorRepoName', lineage.predecessor.repoName);
    storage.kv.put(
      'predecessorTerminalFrontendIndex',
      lineage.predecessor.terminalFrontendIndex,
    );
  }
  storage.kv.put(INITIALIZED_KV_KEY, true);
});
