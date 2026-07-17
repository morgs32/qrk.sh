/*
 * System-worker annotation:
 * Applies finalized account blocks to the actor replica, stores pure actor
 * block outbox rows, and publishes them to ActorBlockRepo. Frontend projection
 * happens downstream in FrontendRepo.
 */

import { getActorController } from '@zerospin/core/accountController/getActorController';
import type { Async } from '@zerospin/core/async/Async';
import { commitAppliedMutationTx } from '@zerospin/core/contracts/commitAppliedMutationTx';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { selectAllFromSelection } from '@zerospin/core/models/makeSelection';
import type {
  IActorId,
  IEncodedResourceShape,
} from '@zerospin/core/models/types';
import type { IGraph, IRefRecord } from '@zerospin/core/system/types';
import type { IAnyError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { system } from 'system';

import { getDeletedRefs } from '../../deltas/getDeletedRefs.js';
import { getInsertedResources } from '../../deltas/getInsertedResources.js';
import {
  getLastAccountIndex,
  setLastAccountCursor,
  setLastAccountIndex,
} from '../../getLastAccountCursor/getLastAccountCursor.js';
import type {
  IAccountBlock,
  IActorBlockOutboxRecord,
  IActorDelta,
} from '../../types.js';
import { actorRepoDrizzleSchemas } from '../ActorRepo.js';

import { publishActorBlocks } from './publishActorBlocks.js';
import { upsertActorBlockOutbox } from './upsertActorBlockOutbox.js';
import { upsertActorBlockOutboxTx } from './upsertActorBlockOutboxTx.js';

export const handleAccountBlocks = Effect.fn('ActorRepo.handleAccountBlocks')(
  function* (props: {
    blocks: readonly IAccountBlock[];
    db: IDb;
    key: {
      generationId: string;
      accountId: string;
      accountName: string;
      actorId: string;
      actorName: string;
    };
    storage: DurableObjectStorage;
  }): Effect.fn.Return<void, IAnyError, Async> {
    const { blocks, db, key, storage } = props;
    const actorController = yield* getActorController({
      system,
      accountName: key.accountName,
      actorName: key.actorName,
    });

    const outboxRecords = yield* makeTx({
      db,
      program: Effect.fn('ActorRepo.handleAccountBlocks.transaction')(
        function* ({ tx }) {
          let lastAccountIndex: number | null = yield* getLastAccountIndex({
            storage,
            defaultValue: null,
          });
          const graph: IGraph = {};
          const graphRows = tx
            .select()
            .from(actorRepoDrizzleSchemas.graph)
            .all();
          for (const row of graphRows) {
            const modelRefs = graph[row.modelName] ?? {};
            modelRefs[row.resourceId] = {
              id: row.resourceId,
              modelName: row.modelName,
            };
            graph[row.modelName] = modelRefs;
          }

          const outboxRecords: IActorBlockOutboxRecord[] = [];
          const actorModels = actorController.models;
          const blocksToApply = [...blocks].sort(
            (left, right) => left.accountIndex - right.accountIndex,
          );

          for (const block of blocksToApply) {
            if (
              lastAccountIndex !== null &&
              block.accountIndex <= lastAccountIndex
            ) {
              continue;
            }

            for (const mutation of block.appliedMutations) {
              if (
                actorController.selections[mutation.modelName] === undefined
              ) {
                continue;
              }
              yield* commitAppliedMutationTx({
                tx,
                models: actorModels,
                mutation,
              });
            }

            const deltas: Record<string, IActorDelta> = {};
            for (const [modelName, selection] of Object.entries(
              actorController.selections,
            )) {
              const selectedRows = selectAllFromSelection({
                db: tx as never,
                models: actorController.models,
                selection,
                actorId: key.actorId as IActorId,
              }).all();
              const destinationSelectedRefs: IRefRecord = {};
              const destinationSelectedResources: Record<
                string,
                IEncodedResourceShape
              > = {};
              for (const row of selectedRows) {
                const record = row as Record<string, unknown>;
                if (
                  typeof record.id !== 'string' ||
                  typeof record.modelName !== 'string'
                ) {
                  continue;
                }
                destinationSelectedRefs[record.id] = {
                  id: record.id,
                  modelName: record.modelName,
                };
                destinationSelectedResources[record.id] =
                  record as IEncodedResourceShape;
              }

              const originSelectedRefs = graph[modelName] ?? {};
              const inserted = getInsertedResources({
                originSelectedRefs,
                destinationSelectedResources,
              });
              const deleted = getDeletedRefs({
                originSelectedRefs,
                destinationSelectedResources,
              });
              deltas[modelName] = {
                inserted,
                deleted,
              };
              graph[modelName] = destinationSelectedRefs;
            }

            lastAccountIndex = block.accountIndex;
            yield* setLastAccountCursor({
              storage,
              tx,
              accountCursor: block.lastAccountCursor,
            });
            yield* setLastAccountIndex({
              storage,
              tx,
              accountIndex: block.accountIndex,
            });

            const outboxRecord = {
              ...block,
              deltas,
              failure: null,
            } satisfies IActorBlockOutboxRecord;
            yield* upsertActorBlockOutboxTx({
              record: outboxRecord,
              tx,
            });
            outboxRecords.push(outboxRecord);
          }

          if (outboxRecords.length > 0) {
            for (const row of tx
              .select()
              .from(actorRepoDrizzleSchemas.graph)
              .all()) {
              tx.delete(actorRepoDrizzleSchemas.graph)
                .where(
                  eq(actorRepoDrizzleSchemas.graph.resourceId, row.resourceId),
                )
                .run();
            }

            for (const modelRefs of Object.values(graph)) {
              for (const ref of Object.values(modelRefs)) {
                tx.insert(actorRepoDrizzleSchemas.graph)
                  .values({
                    resourceId: ref.id,
                    modelName: ref.modelName,
                  })
                  .onConflictDoUpdate({
                    target: actorRepoDrizzleSchemas.graph.resourceId,
                    set: {
                      modelName: ref.modelName,
                    },
                  })
                  .run();
              }
            }
          }

          return outboxRecords;
        },
      ),
    });

    if (outboxRecords.length === 0) {
      return;
    }

    const publishedRecords = yield* publishActorBlocks({
      key,
      records: outboxRecords,
    });
    for (const record of publishedRecords) {
      yield* upsertActorBlockOutbox({
        record,
        db,
      });
    }
  },
);
