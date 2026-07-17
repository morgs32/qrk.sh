import { getFrontendBinding } from '@zerospin/core/accountController/getFrontendBinding';
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import { upsertHelper } from '@zerospin/core/drizzle/upsertHelper';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import type { IAnyError, IAnyErrorJson } from '@zerospin/error';
import { Effect, type Schema } from 'effect';
import { system } from 'system';

import { getActorBlockRepo } from '../../ActorBlockRepo/getActorBlockRepo/getActorBlockRepo.js';
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
}): Effect.fn.Return<void, IAnyError, Async> {
  const { db, key, name, storage } = props;
  if (storage.kv.get(INITIALIZED_KV_KEY) === true) {
    return;
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
  storage.kv.put(FRONTEND_INDEX_KV_KEY, 0);
  storage.kv.put(INITIALIZED_KV_KEY, true);

  const actorBlockRepo = yield* getActorBlockRepo({
    key: {
      generationId: key.generationId,
      accountId: key.accountId,
      accountName: key.accountName,
      actorId: key.actorId,
      actorName: key.actorName,
    },
  });
  yield* makeAsync(() =>
    actorBlockRepo.subscribeFrontend({
      frontendRepoName: name,
      frontendName: key.frontendName,
      currentAccountCursor: accountCursor,
      currentAccountIndex: accountIndex,
    }),
  ).pipe(Effect.flatMap(decodeRpc));
});
