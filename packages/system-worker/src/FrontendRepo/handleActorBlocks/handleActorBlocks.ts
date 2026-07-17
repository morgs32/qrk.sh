import { getFrontendController } from '@zerospin/core/accountController/getFrontendController';
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { applyFrontendMutationTx } from '@zerospin/core/contracts/applyFrontendMutationTx';
import { applyMutationInverseTx } from '@zerospin/core/contracts/applyMutationInverseTx';
import { commitAppliedMutationTx } from '@zerospin/core/contracts/commitAppliedMutationTx';
import { decodeAppliedMutation } from '@zerospin/core/contracts/decodeAppliedMutation';
import { encodeAppliedMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeMutations } from '@zerospin/core/contracts/makeMutations';
import type {
  IEncodedCommand,
  IPushedCommand,
} from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/makeTx';
import type { IDb } from '@zerospin/core/drizzle/types';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { IEncodedResourceShape, IRef } from '@zerospin/core/models/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import { FrontendBlockSchema } from '@zerospin/core/session/FrontendBlockSchema';
import type { IFrontendBlock } from '@zerospin/core/session/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeTelemetryCollector, makeTelemetryLayer } from '@zerospin/logger';
import { env } from 'cloudflare:workers';
import { desc, eq } from 'drizzle-orm';
import { Effect, Either, Schema } from 'effect';
import { system } from 'system';

import {
  getLastAccountIndex,
  setLastAccountCursor,
  setLastAccountIndex,
} from '../../getLastAccountCursor/getLastAccountCursor.js';
import { getSystemLogRepo } from '../../SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';
import type { IActorBlock } from '../../types.js';
import { applyDeltas } from '../applyDeltas/applyDeltas.js';
import { FRONTEND_INDEX_KV_KEY } from '../bootstrap/bootstrap.js';
import { frontendRepoDrizzleSchemas } from '../FrontendRepo.js';

export const handleActorBlocks = Effect.fn('FrontendRepo.handleActorBlocks')(
  function* (props: {
    blocks: readonly IActorBlock[];
    db: IDb;
    key: {
      generationId: string;
      accountId: string;
      accountName: string;
      actorId: string;
      actorName: string;
      frontendName: string;
    };
    storage: DurableObjectStorage;
  }): Effect.fn.Return<void, IAnyError, Async | CuidFactory> {
    const { blocks, db, key, storage } = props;
    const frontendController = yield* getFrontendController({
      system,
      accountName: key.accountName,
      actorName: key.actorName,
      frontendName: key.frontendName,
    });
    const telemetryCollector = makeTelemetryCollector();
    let hadOptimisticReplayFailure = false;

    yield* makeTx({
      db,
      program: Effect.fn('FrontendRepo.handleActorBlocks.transaction')(
        function* ({ tx }) {
          let lastAccountIndex: number | null = yield* getLastAccountIndex({
            storage,
            defaultValue: null,
          });
          const currentFrontendIndex = storage.kv.get(FRONTEND_INDEX_KV_KEY);
          if (
            currentFrontendIndex !== undefined &&
            typeof currentFrontendIndex !== 'number'
          ) {
            return yield* new ZerospinError({
              code: 'frontend-repo-invalid-frontend-index',
              message: 'FrontendRepo frontendIndex must be a number',
            });
          }
          let frontendIndex = currentFrontendIndex ?? 0;
          const pushedCommands = new Map<
            string,
            IEncodedCommand<IPushedCommand>
          >();
          for (const command of tx
            .select()
            .from(frontendRepoDrizzleSchemas.pushedCommands)
            .all()) {
            pushedCommands.set(command.id, command);
          }
          for (const block of [...blocks].sort(
            (a, b) => a.accountIndex - b.accountIndex,
          )) {
            if (
              lastAccountIndex !== null &&
              block.accountIndex <= lastAccountIndex
            ) {
              continue;
            }
            const affectedRefs = new Map<
              string,
              { id: string; modelName: string }
            >();
            const actorInsertedIds = new Set<string>();
            for (const command of [...pushedCommands.values()].sort((a, b) =>
              b.pushedCursor.localeCompare(a.pushedCursor),
            )) {
              const mutations = tx
                .select()
                .from(frontendRepoDrizzleSchemas.pushedMutations)
                .where(
                  eq(
                    frontendRepoDrizzleSchemas.pushedMutations.commandId,
                    command.id,
                  ),
                )
                .orderBy(
                  desc(
                    frontendRepoDrizzleSchemas.pushedMutations.mutationIndex,
                  ),
                )
                .all();
              for (const mutation of mutations) {
                affectedRefs.set(
                  `${mutation.modelName}:${mutation.resourceId}`,
                  {
                    id: mutation.resourceId,
                    modelName: mutation.modelName,
                  },
                );
                const model = yield* getByKeyOrThrow({
                  record: frontendController.models,
                  key: mutation.modelName,
                  recordKind: 'frontend models',
                });
                yield* decodeAppliedMutation({ mutation, model }).pipe(
                  Effect.flatMap(decodedMutation =>
                    applyMutationInverseTx({
                      tx,
                      mutation: decodedMutation,
                    }),
                  ),
                );
              }
            }
            tx.delete(frontendRepoDrizzleSchemas.pushedMutations).run();

            const graph = yield* applyDeltas({
              tx,
              models: frontendController.models,
              graphTable: frontendRepoDrizzleSchemas.graph,
              deltas: block.deltas,
            });
            for (const [modelName, actorDelta] of Object.entries(
              block.deltas,
            )) {
              if (frontendController.models[modelName] === undefined) {
                continue;
              }
              for (const inserted of Object.values(actorDelta.inserted)) {
                actorInsertedIds.add(inserted.id);
                affectedRefs.set(`${modelName}:${inserted.id}`, {
                  id: inserted.id,
                  modelName,
                });
              }
              for (const deleted of Object.values(actorDelta.deleted)) {
                affectedRefs.set(`${modelName}:${deleted.id}`, {
                  id: deleted.id,
                  modelName,
                });
              }
            }
            for (const mutation of block.appliedMutations) {
              affectedRefs.set(`${mutation.modelName}:${mutation.resourceId}`, {
                id: mutation.resourceId,
                modelName: mutation.modelName,
              });
              if (frontendController.models[mutation.modelName] === undefined) {
                continue;
              }
              if (graph[mutation.resourceId] === undefined) {
                continue;
              }
              yield* commitAppliedMutationTx({
                tx,
                models: frontendController.models,
                mutation,
              });
            }

            const executedPushedCommands: IFrontendBlock['executedPushedCommands'][number][] =
              [];
            const failedPushedCommands: IFrontendBlock['failedPushedCommands'][number][] =
              [];
            const terminalSessions = new Set<
              IFrontendBlock['pendingPushedCommands'][number]['sessionId']
            >();
            for (const command of block.executedCommands) {
              if (command.commandType !== 'frontend') {
                continue;
              }
              const pushed = pushedCommands.get(command.id);
              if (
                command.frontendName !== key.frontendName ||
                pushed === undefined
              ) {
                continue;
              }
              executedPushedCommands.push(command);
            }
            for (const command of block.failedCommands) {
              if (command.commandType !== 'frontend') {
                continue;
              }
              const pushed = pushedCommands.get(command.id);
              if (
                command.frontendName !== key.frontendName ||
                pushed === undefined
              ) {
                continue;
              }
              failedPushedCommands.push(command);
            }
            for (const command of [
              ...executedPushedCommands,
              ...failedPushedCommands,
            ]) {
              terminalSessions.add(command.sessionId);
              const terminalStagedCursor = storage.kv.get(
                `terminalStagedCursor:${command.sessionId}`,
              );
              if (
                terminalStagedCursor !== undefined &&
                typeof terminalStagedCursor !== 'string'
              ) {
                return yield* new ZerospinError({
                  code: 'frontend-rebase-invalid-terminal-staged-cursor',
                  message: `Terminal staged cursor for session "${command.sessionId}" must be a string`,
                });
              }
              if (
                terminalStagedCursor === undefined ||
                command.stagedCursor > terminalStagedCursor
              ) {
                storage.kv.put(
                  `terminalStagedCursor:${command.sessionId}`,
                  command.stagedCursor,
                );
              }
              tx.delete(frontendRepoDrizzleSchemas.pushedCommands)
                .where(
                  eq(frontendRepoDrizzleSchemas.pushedCommands.id, command.id),
                )
                .run();
              pushedCommands.delete(command.id);
            }

            if (block.pushedBlockId !== null) {
              const pushedBlockOutboxRow = tx
                .select()
                .from(frontendRepoDrizzleSchemas.pushedBlockOutbox)
                .where(
                  eq(
                    frontendRepoDrizzleSchemas.pushedBlockOutbox.id,
                    block.pushedBlockId,
                  ),
                )
                .get();
              if (pushedBlockOutboxRow !== undefined) {
                terminalSessions.add(pushedBlockOutboxRow.sessionId);
              }
              tx.delete(frontendRepoDrizzleSchemas.pushedBlockOutbox)
                .where(
                  eq(
                    frontendRepoDrizzleSchemas.pushedBlockOutbox.id,
                    block.pushedBlockId,
                  ),
                )
                .run();
            }

            const remainingCommands = [...pushedCommands.values()].sort(
              (left, right) =>
                left.pushedCursor.localeCompare(right.pushedCursor),
            );
            for (const pushedCommand of remainingCommands) {
              const replayed = yield* withSavepoint({
                tx,
                program: Effect.fn('FrontendRepo.handleActorBlocks.replay')(
                  function* ({ tx: savepointTx }) {
                    const contract = yield* getByKeyOrThrow({
                      record: frontendController.contracts,
                      key: pushedCommand.commandName,
                      recordKind: 'frontend contracts',
                    });
                    const decodedPayload = yield* contract.decodePayload({
                      command: pushedCommand,
                    });
                    const payload = yield* contract.validatePayload({
                      payload: decodedPayload,
                    });
                    const guards = yield* getByKeyOrThrow({
                      record: frontendController.guards,
                      key: pushedCommand.commandName,
                      recordKind: 'frontend guards',
                    });
                    for (const guard of guards) {
                      yield* guard({
                        actorId: key.actorId,
                        db: savepointTx,
                        payload,
                      });
                    }
                    const { mutations } = yield* makeMutations({
                      contract,
                      models: frontendController.models,
                      owner: { kind: 'account' },
                      command: {
                        ...pushedCommand,
                        payload,
                      },
                    });
                    for (const [
                      mutationIndex,
                      mutation,
                    ] of mutations.entries()) {
                      const appliedMutation = yield* applyFrontendMutationTx({
                        tx: savepointTx,
                        mutation,
                        commandId: pushedCommand.id,
                        mutationIndex,
                        appliedAt: pushedCommand.pushedAt,
                      });
                      const encodedMutation = yield* encodeAppliedMutation({
                        mutation: appliedMutation,
                      });
                      affectedRefs.set(
                        `${encodedMutation.modelName}:${encodedMutation.resourceId}`,
                        {
                          id: encodedMutation.resourceId,
                          modelName: encodedMutation.modelName,
                        },
                      );
                      savepointTx
                        .insert(frontendRepoDrizzleSchemas.pushedMutations)
                        .values(encodedMutation)
                        .run();
                    }
                  },
                ),
              }).pipe(Effect.either);
              if (Either.isRight(replayed)) {
                continue;
              }

              terminalSessions.add(pushedCommand.sessionId);
              tx.delete(frontendRepoDrizzleSchemas.pushedCommands)
                .where(
                  eq(
                    frontendRepoDrizzleSchemas.pushedCommands.id,
                    pushedCommand.id,
                  ),
                )
                .run();
              pushedCommands.delete(pushedCommand.id);
              hadOptimisticReplayFailure = true;
              yield* Effect.logWarning(
                `FrontendRepo removed pushed command "${pushedCommand.id}" after optimistic replay failed: ${replayed.left.message}`,
              ).pipe(
                Effect.annotateLogs({
                  commandId: pushedCommand.id,
                  failure: replayed.left.message,
                  frontendName: key.frontendName,
                }),
              );
            }

            for (const sessionId of terminalSessions) {
              const openPushedBlock = tx
                .select({ id: frontendRepoDrizzleSchemas.pushedBlockOutbox.id })
                .from(frontendRepoDrizzleSchemas.pushedBlockOutbox)
                .where(
                  eq(
                    frontendRepoDrizzleSchemas.pushedBlockOutbox.sessionId,
                    sessionId,
                  ),
                )
                .get();
              if (openPushedBlock !== undefined) {
                continue;
              }
              const processedStagedCursor = storage.kv.get(
                `processedStagedCursor:${sessionId}`,
              );
              if (
                processedStagedCursor !== undefined &&
                typeof processedStagedCursor !== 'string'
              ) {
                return yield* new ZerospinError({
                  code: 'frontend-rebase-invalid-processed-staged-cursor',
                  message: `Processed staged cursor for session "${sessionId}" must be a string`,
                });
              }
              if (processedStagedCursor !== undefined) {
                storage.kv.put(
                  `terminalStagedCursor:${sessionId}`,
                  processedStagedCursor,
                );
              }
            }

            const inserted: IEncodedResourceShape[] = [];
            const updated: IEncodedResourceShape[] = [];
            const deleted: IRef[] = [];
            for (const affectedRef of affectedRefs.values()) {
              const model = frontendController.models[affectedRef.modelName];
              if (model === undefined) {
                continue;
              }
              const row = tx
                .select()
                .from(model.drizzleSchema)
                .where(eq(model.drizzleSchema.id, affectedRef.id))
                .get();
              if (row === undefined) {
                deleted.push(affectedRef);
                continue;
              }
              const resource = yield* Schema.validate(EncodedResourceSchema)(
                row,
              ).pipe(
                mapParseError({
                  code: 'frontend-convergence-resource-decode-failed',
                  prefix: `Failed to decode converged resource "${affectedRef.id}"`,
                }),
              );
              if (actorInsertedIds.has(resource.id)) {
                inserted.push(resource);
              } else {
                updated.push(resource);
              }
            }

            const delta = { inserted, updated, deleted };
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
            frontendIndex += 1;
            storage.kv.put(FRONTEND_INDEX_KV_KEY, frontendIndex);
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
            const frontendBlock = {
              frontendName: key.frontendName,
              lastAccountCursor: block.lastAccountCursor,
              frontendIndex,
              lastRebasedPushedCursor: lastRebasedPushedCursor ?? null,
              delta,
              pendingPushedCommands: [...pushedCommands.values()].sort(
                (left, right) =>
                  left.pushedCursor.localeCompare(right.pushedCursor),
              ),
              executedPushedCommands,
              failedPushedCommands,
            } satisfies IFrontendBlock;
            const encodedFrontendBlock = yield* Schema.encode(
              Schema.parseJson(FrontendBlockSchema),
            )(frontendBlock).pipe(
              mapParseError({
                code: 'frontend-block-encode-failed',
                prefix: 'Failed to encode actor-originated frontend block',
              }),
            );
            tx.insert(frontendRepoDrizzleSchemas.frontendBlockOutbox)
              .values({
                frontendIndex,
                block: encodedFrontendBlock,
                publishedAt: null,
                failure: null,
              })
              .onConflictDoNothing()
              .run();
          }
        },
      ),
    }).pipe(Effect.provide(makeTelemetryLayer(telemetryCollector)));

    if (!hadOptimisticReplayFailure) {
      return;
    }

    const batch = telemetryCollector.flush();
    yield* Effect.gen(function* () {
      const systemLogRepo = yield* getSystemLogRepo({
        key: { generationId: key.generationId },
      });
      const encoded = yield* makeAsync(() =>
        systemLogRepo.appendTelemetryBatch({
          batch,
          deployId: env.ZEROSPIN_DEPLOY_ID,
        }),
      );
      yield* decodeRpc(encoded);
    }).pipe(Effect.catchAll(() => Effect.void));
  },
);
