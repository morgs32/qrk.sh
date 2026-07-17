/*
 * System-worker annotation:
 * Implements the ActorRepo bootstrap lifecycle operation.
 * makeRepo runs this after migration, so ActorRepo RPC methods can assume local snapshot state exists.
 */

import { getActorController } from '@zerospin/core/accountController/getActorController';
import type {} from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { getGraph } from '@zerospin/core/models/getGraph';
import type {
  IActorId,
  IEncodedResourceShape,
} from '@zerospin/core/models/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import type { IAnyErrorJson } from '@zerospin/error';
import { Effect, type Schema } from 'effect';
import { system } from 'system';

import { getAccountBlockRepo } from '../../AccountBlockRepo/getAccountBlockRepo/getAccountBlockRepo.js';
import { getAccountRepo } from '../../AccountRepo/getAccountRepo/getAccountRepo.js';
import {
  setLastAccountCursor,
  setLastAccountIndex,
} from '../../getLastAccountCursor/getLastAccountCursor.js';
import { actorRepoDrizzleSchemas } from '../ActorRepo.js';

/*
Remember bootstrap on makeRepoUtils will always run just once when the Durable Object is created.
*/
export const bootstrap = Effect.fn('ActorRepo.bootstrap')(function* (props: {
  ctx: DurableObjectState;
  name: string;
  key: {
    generationId: string;
    accountId: string;
    accountName: string;
    actorName: string;
    actorId: string;
  };
  db: IDb;
  schema: unknown;
  relations: unknown;
}) {
  const { ctx, db, key } = props;
  const { generationId, accountId, accountName, actorName } = key;

  const actorController = yield* getActorController({
    system,
    accountName,
    actorName,
  });

  const accountRepo = yield* getAccountRepo({
    key: {
      generationId,
      accountId,
      accountName,
    },
  });

  const watermarkAccountCursor = yield* makeAsync(() =>
    accountRepo.getLastAccountCursor(),
  ).pipe(Effect.flatMap(decodeRpc));
  const watermarkAccountIndex = yield* makeAsync(() =>
    accountRepo.getLastAccountIndex(),
  ).pipe(Effect.flatMap(decodeRpc));

  yield* Effect.all(
    Object.keys(actorController.selections).map(modelName =>
      Effect.gen(function* () {
        const resources = yield* makeAsync<
          Schema.EitherEncoded<Array<IEncodedResourceShape>, IAnyErrorJson>
        >(() =>
          accountRepo.dumpAccountModelResources({
            accountName,
            modelName,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        yield* makeTx({
          db,
          program: Effect.fn('ActorRepo.bootstrap.applySnapshotModel')(
            function* ({ tx }) {
              const selection = yield* getByKeyOrThrow({
                record: actorController.selections,
                key: modelName,
                recordKind: 'actor selections',
              });
              const model = selection.model;

              if (resources.length === 0) {
                return;
              }

              tx.insert(model.drizzleSchema).values(resources).run();
            },
          ),
        });
      }),
    ),
  );

  const graph = getGraph({
    db: db as never,
    actorId: key.actorId as IActorId,
    models: actorController.models,
    selections: actorController.selections,
  });

  const graphRows = Object.entries(graph).map(([resourceId, resource]) => ({
    resourceId,
    modelName: resource.modelName,
  }));

  if (graphRows.length > 0) {
    db.insert(actorRepoDrizzleSchemas.graph).values(graphRows).run();
  }

  const accountBlockRepo = yield* getAccountBlockRepo({
    key: {
      generationId,
      accountId,
      accountName,
    },
  });

  yield* makeAsync(() =>
    accountBlockRepo.subscribeActor({
      actorId: key.actorId,
      actorName,
      currentAccountCursor: watermarkAccountCursor,
      currentAccountIndex: watermarkAccountIndex,
      actorRepoName: props.name,
    }),
  ).pipe(Effect.flatMap(decodeRpc));

  yield* makeTx({
    db,
    program: Effect.fn('ActorRepo.bootstrap.setLastAccountCursor')(function* ({
      tx,
    }) {
      yield* setLastAccountCursor({
        storage: ctx.storage,
        tx,
        accountCursor: watermarkAccountCursor,
      });
      yield* setLastAccountIndex({
        storage: ctx.storage,
        tx,
        accountIndex: watermarkAccountIndex,
      });
    }),
  });
});
