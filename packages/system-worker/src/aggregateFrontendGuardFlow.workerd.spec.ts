import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { FailedPushedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { makeSessionCommand } from '@zerospin/core/contracts/makeSessionCommand';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { makeCursor } from '@zerospin/core/utils/makeCursor';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { Effect, Layer, Schema } from 'effect';
import { afterAll, describe, expect } from 'vitest';

import { AggregateFrontendApi } from './AggregateFrontendApi/AggregateFrontendApi.js';
import { getAggregateFrontendRepo } from './AggregateFrontendRepo/getAggregateFrontendRepo/getAggregateFrontendRepo.js';
import { AggregateRepo } from './AggregateRepo/AggregateRepo.js';
import { getAggregateRepo } from './AggregateRepo/getAggregateRepo/getAggregateRepo.js';
import { main, mainModels, system } from './fixtures/system.js';
import { makeSystemRuntime } from './makeSystemRuntime.js';
import { managedRuntime } from './managedRuntime.js';
import { SystemRepo } from './SystemRepo/SystemRepo.js';
import { WorkerExportsSystemWorkerResolver } from './SystemWorkerResolver/WorkerExportsSystemWorkerResolver.js';
import { executeInRepo } from './workerd-utils/executeInRepo.js';
import { prepareGenerationStateFixture } from './workerd-utils/prepareGenerationStateFixture.js';

const runtime = makeSystemRuntime({
  systemWorkerResolver: WorkerExportsSystemWorkerResolver,
});

afterAll(async () => {
  await runtime.dispose();
});

describe('AggregateFrontendApi authored guards', () => {
  it.layer(
    Layer.mergeAll(
      AsyncLive,
      IncrementalMonotonicFactory,
      makePrefixedIncrementalIdFactory('aggregate-frontend-guard-flow'),
    ),
  )(it => {
    it.effect(
      'rejects payloads, queries the identity-bound aggregate model, and revalidates after cursor advancement',
      () =>
        Effect.gen(function* () {
          const activation = yield* prepareGenerationStateFixture({
            clean: true,
            workerVersionId: 'aggregate-frontend-guard-flow',
          });
          const systemId = Schema.decodeUnknownSync(
            makeAbbreviationIdSchema(coreAbbreviations.system),
          )(env.ZEROSPIN_SYSTEM_ID);
          const aggregateId = makeAggregateId({
            id: 'aggregate-frontend-guard-flow',
          });
          const userId = mainModels.user.prefixId(
            'aggregate-frontend-guard-flow',
          );
          const listId = mainModels.list.prefixId(
            'aggregate-frontend-guard-flow',
          );
          const aggregate = system.aggregates.user;
          const systemRepo = SystemRepo.getRepo({ systemId });

          const createUserCommand = yield* aggregate.makeCommand({
            contractName: 'createUser',
            aggregateId,
            systemName: system.name,
            payload: { id: userId, name: 'Guard flow user' },
          });
          const createListCommand = yield* aggregate.makeCommand({
            contractName: 'createList',
            aggregateId,
            systemName: system.name,
            payload: { id: listId, name: 'Guarded list', userId },
          });
          const encodedCreateUserCommand = yield* encodeCommand({
            contract: aggregate.contracts.createUser,
            command: createUserCommand,
          });
          const encodedCreateListCommand = yield* encodeCommand({
            contract: aggregate.contracts.createList,
            command: createListCommand,
          });
          yield* makeAsync(() =>
            systemRepo.finalizeAggregateCommands({
              aggregateId,
              aggregateName: aggregate.name,
              commands: [encodedCreateUserCommand, encodedCreateListCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const frontendSpec = makeFrontendControllerSpec(main);
          const frontendApi = new AggregateFrontendApi({
            authResults: {
              actorRef: {
                aggregateId,
                aggregateName: aggregate.name,
                userId,
              },
              aggregateFrontendLock: frontendSpec.aggregateFrontendLock,
              frontendName: main.frontendName,
              frontendSpec,
              generationId: activation.generationId,
              systemId,
              systemVersion: system.version,
              systemWorkerName: 'aggregate-frontend-guard-flow',
            },
            runtime,
          });
          yield* makeAsync(() =>
            frontendApi.getState({ traceContext: null, args: [] }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));

          const rejectedSessionCommand = yield* makeSessionCommand({
            aggregateId,
            aggregateName: aggregate.name,
            userId,
            contract: main.contracts.createList,
            payload: {
              id: mainModels.list.prefixId('payload-rejected'),
              name: 'invalid-name',
              userId,
            },
            sessionId: 'sesn_frontend_guard_rejected',
            frontendName: main.frontendName,
            systemName: system.name,
          });
          const rejectedStagedCommand = yield* encodeCommand({
            contract: main.contracts.createList,
            command: {
              ...rejectedSessionCommand,
              commandType: 'frontend',
              stagedCursor: yield* makeCursor({
                abbreviation: coreAbbreviations.stagedCursor,
              }),
              stagedAt: new Date('2026-04-01T00:00:00.000Z'),
              replicaIndex: 1,
              status: 'staged',
            },
          });
          const rejected = yield* makeAsync(() =>
            frontendApi.pushCommands({
              traceContext: null,
              args: [{ commands: [rejectedStagedCommand] }],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(rejected.failedStagedCommands).toEqual([
            expect.objectContaining({
              id: rejectedStagedCommand.id,
              failure: expect.stringContaining('list-name-rejected'),
            }),
          ]);

          const acceptedSessionCommand = yield* makeSessionCommand({
            aggregateId,
            aggregateName: aggregate.name,
            userId,
            contract: main.contracts.updateList,
            payload: { id: listId, name: 'Guard query accepted', userId },
            sessionId: 'sesn_frontend_guard_accepted',
            frontendName: main.frontendName,
            systemName: system.name,
          });
          const acceptedStagedCommand = yield* encodeCommand({
            contract: main.contracts.updateList,
            command: {
              ...acceptedSessionCommand,
              commandType: 'frontend',
              stagedCursor: yield* makeCursor({
                abbreviation: coreAbbreviations.stagedCursor,
              }),
              stagedAt: new Date('2026-04-01T00:00:01.000Z'),
              replicaIndex: 2,
              status: 'staged',
            },
          });
          const accepted = yield* makeAsync(() =>
            frontendApi.pushCommands({
              traceContext: null,
              args: [{ commands: [acceptedStagedCommand] }],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(accepted.failedStagedCommands).toEqual([]);
          expect(accepted.pushedCommands).toEqual([
            expect.objectContaining({ id: acceptedStagedCommand.id }),
          ]);

          const aggregateFrontendRepo = yield* getAggregateFrontendRepo({
            key: {
              generationId: activation.generationId,
              aggregateId,
              aggregateName: aggregate.name,
              userId,
              frontendName: main.frontendName,
            },
          });
          yield* makeAsync(() =>
            aggregateFrontendRepo.drainPushBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          const acceptedRetry = yield* makeAsync(() =>
            frontendApi.pushCommands({
              traceContext: null,
              args: [{ commands: [acceptedStagedCommand] }],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(acceptedRetry.executedCommands).toEqual([
            expect.objectContaining({ id: acceptedStagedCommand.id }),
          ]);

          const staleSessionCommand = yield* makeSessionCommand({
            aggregateId,
            aggregateName: aggregate.name,
            userId,
            contract: main.contracts.updateList,
            payload: { id: listId, name: 'stale-at-commit', userId },
            sessionId: 'sesn_frontend_guard_stale',
            frontendName: main.frontendName,
            systemName: system.name,
          });
          const stalePushedCommand = yield* encodeCommand({
            contract: main.contracts.updateList,
            command: {
              ...staleSessionCommand,
              commandType: 'frontend',
              stagedCursor: yield* makeCursor({
                abbreviation: coreAbbreviations.stagedCursor,
              }),
              stagedAt: new Date('2026-04-01T00:00:02.000Z'),
              replicaIndex: 3,
              pushedCursor: yield* makeCursor({
                abbreviation: coreAbbreviations.pushedCursor,
              }),
              pushedAt: new Date('2026-04-01T00:00:03.000Z'),
              status: 'pushed',
            },
          });
          const acceptedOutcome = acceptedRetry.executedCommands[0];
          if (acceptedOutcome === undefined) {
            return yield* Effect.dieMessage(
              'Expected the accepted guard command to have one executed outcome',
            );
          }

          const deleteListCommand = yield* aggregate.makeCommand({
            contractName: 'deleteList',
            aggregateId,
            systemName: system.name,
            payload: { id: listId },
          });
          const encodedDeleteListCommand = yield* encodeCommand({
            contract: aggregate.contracts.deleteList,
            command: deleteListCommand,
          });
          const deleteReceipt = yield* makeAsync(() =>
            systemRepo.finalizeAggregateCommands({
              aggregateId,
              aggregateName: aggregate.name,
              commands: [encodedDeleteListCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(deleteReceipt.executedCommands).toEqual([
            expect.objectContaining({ id: encodedDeleteListCommand.id }),
          ]);

          const aggregateRepo = yield* getAggregateRepo({
            key: {
              generationId: activation.generationId,
              aggregateId,
              aggregateName: aggregate.name,
            },
          });
          yield* makeAsync(() =>
            aggregateRepo.finalizePushBlock({
              traceContext: null,
              args: [
                {
                  pushBlock: {
                    writeIndex: acceptedRetry.writeIndex + 2,
                    guardedAtAggregateCursor: acceptedOutcome.aggregateCursor,
                    pendingCommands: [],
                    pushedCommands: [stalePushedCommand],
                    executedCommands: [],
                    failedStagedCommands: [],
                    failedPushedCommands: [],
                  },
                },
              ],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          const storedStaleOutcome = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateRepo,
              repo: AggregateRepo,
              key: {
                generationId: activation.generationId,
                aggregateId,
                aggregateName: aggregate.name,
              },
              fn: ({ db, schema }) =>
                db
                  .select({
                    command: schema.aggregateCommandOutcomes.command,
                  })
                  .from(schema.aggregateCommandOutcomes)
                  .where(
                    eq(
                      schema.aggregateCommandOutcomes.commandId,
                      stalePushedCommand.id,
                    ),
                  )
                  .get(),
            }),
          );
          const staleOutcome = yield* Schema.decodeUnknown(
            Schema.parseJson(FailedPushedCommandSchema),
          )(storedStaleOutcome?.command);
          expect(staleOutcome).toEqual(
            expect.objectContaining({
              id: stalePushedCommand.id,
              failure: expect.stringContaining('list-not-found'),
            }),
          );
        }),
      120_000,
    );
  });
});
