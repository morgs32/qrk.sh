import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { PushBlockSchema } from '@zerospin/core/contracts/CommandSchema';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { makeSessionCommand } from '@zerospin/core/contracts/makeSessionCommand';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { makeCursor } from '@zerospin/core/utils/makeCursor';
import {
  abortAllDurableObjects,
  env,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { Effect, Either, Layer, Schema } from 'effect';
import { afterEach, describe, expect } from 'vitest';

import { getAggregateFrontendRepo } from './AggregateFrontendRepo/getAggregateFrontendRepo/getAggregateFrontendRepo.js';
import { getAggregateRepo } from './AggregateRepo/getAggregateRepo/getAggregateRepo.js';
import { main, system } from './fixtures/system.js';
import { getServiceRepo } from './ServiceRepo/getServiceRepo/getServiceRepo.js';
import { SystemRepo } from './SystemRepo/SystemRepo.js';
import {
  FinalizeAggregateCommandsSystemWriteCommandsSchema,
  FinalizeAggregateCommandsSystemWriteResultSchema,
  FinalizeAggregateCommandsSystemWriteTargetSchema,
  FinalizeServiceCommandsSystemWriteCommandsSchema,
  FinalizeServiceCommandsSystemWriteResultSchema,
  FinalizeServiceCommandsSystemWriteTargetSchema,
  PushCommandsSystemWriteCommandsSchema,
  PushCommandsSystemWriteResultSchema,
  PushCommandsSystemWriteTargetSchema,
} from './SystemRepo/systemWriteSchemas.js';
import { prepareGenerationStateFixture } from './workerd-utils/prepareGenerationStateFixture.js';

afterEach(async () => {
  Reflect.set(env, 'ZEROSPIN_TEST_INTERRUPT_SYSTEM_WRITE_CAPTURE', false);
  await abortAllDurableObjects();
});

describe('generation drain durable SystemRepo write lifecycle', () => {
  it.layer(
    Layer.mergeAll(
      AsyncLive,
      IncrementalMonotonicFactory,
      makePrefixedIncrementalIdFactory('generation-drain-lifecycle'),
    ),
  )(it => {
    it.effect(
      'orders all operations and recovers an exact child result after capture interruption',
      () =>
        Effect.gen(function* () {
          const activation = yield* prepareGenerationStateFixture({
            clean: true,
            workerVersionId: 'generation-drain-lifecycle',
          });
          const systemRepo = SystemRepo.getRepo({
            systemId: env.ZEROSPIN_SYSTEM_ID,
          });
          const aggregate = system.aggregates.user;
          const service = system.services.app;
          const aggregateId = makeAggregateId({
            id: 'generation-drain-lifecycle',
          });
          const userId = aggregate.models.user.prefixId(
            'generation-drain-lifecycle',
          );
          const firstProductId = service.models.product.prefixId(
            'generation-drain-first',
          );
          const secondProductId = service.models.product.prefixId(
            'generation-drain-second',
          );
          const listId = aggregate.models.list.prefixId(
            'generation-drain-push',
          );
          const interruptedListId = aggregate.models.list.prefixId(
            'generation-drain-interrupted',
          );
          const frontendSpec = makeFrontendControllerSpec(main);
          const aggregateFrontendLock = frontendSpec.aggregateFrontendLock;

          const createUserCommand = yield* aggregate.makeCommand({
            contractName: 'createUser',
            aggregateId,
            systemName: system.name,
            payload: {
              id: userId,
              name: 'Generation drain lifecycle user',
            },
          });
          const encodedCreateUserCommand = yield* encodeCommand({
            contract: aggregate.contracts.createUser,
            command: createUserCommand,
          });
          const aggregateReceipt = yield* makeAsync(() =>
            systemRepo.finalizeAggregateCommands({
              aggregateId,
              aggregateName: aggregate.name,
              commands: [encodedCreateUserCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const firstServiceCommand = yield* service.makeCommand({
            contractName: 'createProduct',
            payload: {
              id: firstProductId,
              name: 'Generation drain first product',
            },
          });
          const secondServiceCommand = yield* service.makeCommand({
            contractName: 'createProduct',
            payload: {
              id: secondProductId,
              name: 'Generation drain second product',
            },
          });
          const encodedFirstServiceCommand = yield* encodeCommand({
            contract: service.contracts.createProduct,
            command: firstServiceCommand,
          });
          const encodedSecondServiceCommand = yield* encodeCommand({
            contract: service.contracts.createProduct,
            command: secondServiceCommand,
          });
          const firstServiceReceipt = yield* makeAsync(() =>
            systemRepo.finalizeServiceCommands({
              serviceName: service.name,
              commands: [encodedFirstServiceCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const secondServiceReceipt = yield* makeAsync(() =>
            systemRepo.finalizeServiceCommands({
              serviceName: service.name,
              commands: [encodedSecondServiceCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

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
            aggregateFrontendRepo.getState({
              aggregateId,
              aggregateName: aggregate.name,
              userId,
              frontendName: main.frontendName,
              lineage: { predecessor: null },
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const stagedCommand = yield* encodeCommand({
            contract: main.contracts.createList,
            command: {
              ...(yield* makeSessionCommand({
                aggregateId,
                aggregateName: aggregate.name,
                userId,
                contract: main.contracts.createList,
                payload: {
                  id: listId,
                  name: 'Generation drain pushed list',
                  userId,
                },
                sessionId: 'sesn_generation_drain_lifecycle',
                frontendName: main.frontendName,
                systemName: system.name,
              })),
              commandType: 'frontend',
              stagedCursor: yield* makeCursor({
                abbreviation: coreAbbreviations.stagedCursor,
              }),
              stagedAt: new Date('2026-08-13T00:00:00.000Z'),
              pushedCursor: null,
              replicaIndex: 1,
              status: 'staged',
            },
          });
          const pushReceipt = yield* makeAsync(() =>
            systemRepo.pushCommands({
              actorRef: {
                aggregateId,
                aggregateName: aggregate.name,
                userId,
              },
              frontendName: main.frontendName,
              aggregateFrontendLock,
              commands: [stagedCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const accepted = yield* Effect.promise(() =>
            runInDurableObject(systemRepo, (_instance, state) => ({
              selection: state.storage.sql
                .exec<{
                  lastWriteIndex: number;
                  writeGenerationId: string;
                }>('SELECT lastWriteIndex, writeGenerationId FROM selection')
                .one(),
              generation: state.storage.sql
                .exec<{ lastWriteIndex: number }>(
                  'SELECT lastWriteIndex FROM generationState WHERE generationId = ?',
                  activation.generationId,
                )
                .one(),
              rows: state.storage.sql
                .exec<{
                  writeIndex: number;
                  generationId: string;
                  operation: string;
                  target: string;
                  commands: string;
                  result: string | null;
                  deliveryAttemptCount: number;
                  resolvedAt: number | null;
                }>(
                  'SELECT writeIndex, generationId, operation, target, commands, result, deliveryAttemptCount, resolvedAt FROM systemWrites ORDER BY writeIndex',
                )
                .toArray(),
            })),
          );
          expect(accepted.selection).toEqual({
            lastWriteIndex: 4,
            writeGenerationId: activation.generationId,
          });
          expect(accepted.generation).toEqual({ lastWriteIndex: 4 });
          expect(accepted.rows.map(row => row.writeIndex)).toEqual([
            1, 2, 3, 4,
          ]);
          expect(accepted.rows.map(row => row.operation)).toEqual([
            'finalizeAggregateCommands',
            'finalizeServiceCommands',
            'finalizeServiceCommands',
            'pushCommands',
          ]);
          expect(
            accepted.rows.every(
              row =>
                row.generationId === activation.generationId &&
                row.result !== null &&
                row.deliveryAttemptCount === 1 &&
                row.resolvedAt !== null,
            ),
          ).toBe(true);

          const aggregateRow = accepted.rows[0];
          const firstServiceRow = accepted.rows[1];
          const secondServiceRow = accepted.rows[2];
          const pushRow = accepted.rows[3];
          if (
            aggregateRow === undefined ||
            firstServiceRow === undefined ||
            secondServiceRow === undefined ||
            pushRow === undefined ||
            aggregateRow.result === null ||
            firstServiceRow.result === null ||
            secondServiceRow.result === null ||
            pushRow.result === null
          ) {
            return yield* Effect.die(
              new Error('Expected four resolved durable SystemRepo writes'),
            );
          }

          expect(
            yield* Schema.decodeUnknown(
              Schema.parseJson(
                FinalizeAggregateCommandsSystemWriteTargetSchema,
              ),
            )(aggregateRow.target),
          ).toEqual({
            aggregateId,
            aggregateName: aggregate.name,
          });
          expect(
            yield* Schema.decodeUnknown(
              Schema.parseJson(
                FinalizeAggregateCommandsSystemWriteCommandsSchema,
              ),
            )(aggregateRow.commands),
          ).toEqual([encodedCreateUserCommand]);
          expect(
            yield* Schema.decodeUnknown(
              Schema.parseJson(
                FinalizeAggregateCommandsSystemWriteResultSchema,
              ),
            )(aggregateRow.result),
          ).toEqual(Either.right(aggregateReceipt));

          for (const [row, command, receipt] of [
            [firstServiceRow, encodedFirstServiceCommand, firstServiceReceipt],
            [
              secondServiceRow,
              encodedSecondServiceCommand,
              secondServiceReceipt,
            ],
          ]) {
            expect(
              yield* Schema.decodeUnknown(
                Schema.parseJson(
                  FinalizeServiceCommandsSystemWriteTargetSchema,
                ),
              )(row.target),
            ).toEqual({ serviceName: service.name });
            expect(
              yield* Schema.decodeUnknown(
                Schema.parseJson(
                  FinalizeServiceCommandsSystemWriteCommandsSchema,
                ),
              )(row.commands),
            ).toEqual([command]);
            expect(
              yield* Schema.decodeUnknown(
                Schema.parseJson(
                  FinalizeServiceCommandsSystemWriteResultSchema,
                ),
              )(row.result),
            ).toEqual(Either.right(receipt));
          }

          expect(
            yield* Schema.decodeUnknown(
              Schema.parseJson(PushCommandsSystemWriteTargetSchema),
            )(pushRow.target),
          ).toEqual({
            aggregateId,
            aggregateName: aggregate.name,
            userId,
            frontendName: main.frontendName,
            aggregateFrontendLock,
          });
          expect(
            yield* Schema.decodeUnknown(
              Schema.parseJson(PushCommandsSystemWriteCommandsSchema),
            )(pushRow.commands),
          ).toEqual([stagedCommand]);
          expect(
            yield* Schema.decodeUnknown(
              Schema.parseJson(PushCommandsSystemWriteResultSchema),
            )(pushRow.result),
          ).toEqual(Either.right(pushReceipt));

          const serviceRepo = yield* getServiceRepo({
            key: {
              generationId: activation.generationId,
              serviceName: service.name,
            },
          });
          const serviceOutcomes = yield* Effect.promise(() =>
            runInDurableObject(serviceRepo, (_instance, state) =>
              state.storage.sql
                .exec<{
                  commandId: string;
                  writeIndex: number;
                  serviceIndex: number;
                }>(
                  'SELECT commandId, writeIndex, serviceIndex FROM serviceCommandOutcomes ORDER BY serviceIndex',
                )
                .toArray(),
            ),
          );
          expect(serviceOutcomes).toEqual([
            {
              commandId: encodedFirstServiceCommand.id,
              writeIndex: 2,
              serviceIndex: 1,
            },
            {
              commandId: encodedSecondServiceCommand.id,
              writeIndex: 3,
              serviceIndex: 2,
            },
          ]);
          const retainedPushBlock = yield* Effect.promise(() =>
            runInDurableObject(aggregateFrontendRepo, (_instance, state) =>
              state.storage.sql
                .exec<{ writeIndex: number; block: string }>(
                  'SELECT writeIndex, block FROM pushBlockOutbox',
                )
                .one(),
            ),
          );
          expect(retainedPushBlock.writeIndex).toBe(4);
          expect(
            yield* Schema.decodeUnknown(
              Schema.parseJson(PushCommandsSystemWriteResultSchema),
            )(pushRow.result),
          ).toEqual(
            Either.right(
              yield* Schema.decodeUnknown(Schema.parseJson(PushBlockSchema))(
                retainedPushBlock.block,
              ),
            ),
          );

          const interruptedCommand = yield* aggregate.makeCommand({
            contractName: 'createList',
            aggregateId,
            systemName: system.name,
            payload: {
              id: interruptedListId,
              name: 'Generation drain interrupted list',
              userId,
            },
          });
          const encodedInterruptedCommand = yield* encodeCommand({
            contract: aggregate.contracts.createList,
            command: interruptedCommand,
          });

          Reflect.set(
            env,
            'ZEROSPIN_TEST_INTERRUPT_SYSTEM_WRITE_CAPTURE',
            true,
          );
          yield* Effect.promise(() => abortAllDurableObjects());
          const interruptedSystemRepo = SystemRepo.getRepo({
            systemId: env.ZEROSPIN_SYSTEM_ID,
          });
          const interrupted = yield* makeAsync(() =>
            interruptedSystemRepo.finalizeAggregateCommands({
              aggregateId,
              aggregateName: aggregate.name,
              commands: [encodedInterruptedCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc), Effect.either);
          expect(interrupted).toMatchObject({
            _tag: 'Left',
            left: { code: 'system-write-result-capture-interrupted' },
          });

          const pending = yield* Effect.promise(() =>
            runInDurableObject(interruptedSystemRepo, (_instance, state) =>
              state.storage.sql
                .exec<{
                  writeIndex: number;
                  result: string | null;
                  deliveryAttemptCount: number;
                  lastDeliveryFailure: string | null;
                }>(
                  'SELECT writeIndex, result, deliveryAttemptCount, lastDeliveryFailure FROM systemWrites WHERE writeIndex = 5',
                )
                .one(),
            ),
          );
          expect(pending).toMatchObject({
            writeIndex: 5,
            result: null,
            deliveryAttemptCount: 1,
            lastDeliveryFailure: null,
          });

          const aggregateRepo = yield* getAggregateRepo({
            key: {
              generationId: activation.generationId,
              aggregateId,
              aggregateName: aggregate.name,
            },
          });
          const committedBeforeRecovery = yield* Effect.promise(() =>
            runInDurableObject(aggregateRepo, (_instance, state) => ({
              outcomes: state.storage.sql
                .exec<{
                  commandId: string;
                  commandBytes: string;
                  writeIndex: number;
                }>(
                  'SELECT commandId, commandBytes, writeIndex FROM aggregateCommandOutcomes WHERE commandId = ?',
                  encodedInterruptedCommand.id,
                )
                .toArray(),
              blocks: state.storage.sql
                .exec<{ writeIndex: number }>(
                  'SELECT writeIndex FROM aggregateBlockOutbox WHERE writeIndex = 5',
                )
                .toArray(),
            })),
          );
          expect(committedBeforeRecovery.outcomes).toEqual([
            expect.objectContaining({
              commandId: encodedInterruptedCommand.id,
              writeIndex: 5,
            }),
          ]);
          expect(committedBeforeRecovery.blocks).toEqual([{ writeIndex: 5 }]);

          Reflect.set(
            env,
            'ZEROSPIN_TEST_INTERRUPT_SYSTEM_WRITE_CAPTURE',
            false,
          );
          yield* Effect.promise(() => abortAllDurableObjects());
          const recoverySystemRepo = SystemRepo.getRepo({
            systemId: env.ZEROSPIN_SYSTEM_ID,
          });
          expect(
            yield* Effect.promise(() =>
              runDurableObjectAlarm(recoverySystemRepo),
            ),
          ).toBe(true);

          const recovered = yield* Effect.promise(() =>
            runInDurableObject(recoverySystemRepo, (_instance, state) =>
              state.storage.sql
                .exec<{
                  writeIndex: number;
                  result: string | null;
                  deliveryAttemptCount: number;
                  lastDeliveryFailure: string | null;
                  resolvedAt: number | null;
                }>(
                  'SELECT writeIndex, result, deliveryAttemptCount, lastDeliveryFailure, resolvedAt FROM systemWrites WHERE writeIndex = 5',
                )
                .one(),
            ),
          );
          expect(recovered).toMatchObject({
            writeIndex: 5,
            deliveryAttemptCount: 2,
            lastDeliveryFailure: null,
          });
          expect(recovered.result).not.toBeNull();
          expect(recovered.resolvedAt).not.toBeNull();
          if (recovered.result === null) {
            return yield* Effect.die(
              new Error('Expected alarm recovery to capture write 5'),
            );
          }
          const recoveredResult = yield* Schema.decodeUnknown(
            Schema.parseJson(FinalizeAggregateCommandsSystemWriteResultSchema),
          )(recovered.result);

          const recoveryAggregateRepo = yield* getAggregateRepo({
            key: {
              generationId: activation.generationId,
              aggregateId,
              aggregateName: aggregate.name,
            },
          });
          const committedAfterRecovery = yield* Effect.promise(() =>
            runInDurableObject(recoveryAggregateRepo, (_instance, state) => ({
              outcomes: state.storage.sql
                .exec<{
                  commandId: string;
                  commandBytes: string;
                  writeIndex: number;
                }>(
                  'SELECT commandId, commandBytes, writeIndex FROM aggregateCommandOutcomes WHERE commandId = ?',
                  encodedInterruptedCommand.id,
                )
                .toArray(),
              blocks: state.storage.sql
                .exec<{ writeIndex: number }>(
                  'SELECT writeIndex FROM aggregateBlockOutbox WHERE writeIndex = 5',
                )
                .toArray(),
            })),
          );
          expect(committedAfterRecovery).toEqual(committedBeforeRecovery);

          const retryResult = yield* makeAsync(() =>
            recoverySystemRepo.finalizeAggregateCommands({
              aggregateId,
              aggregateName: aggregate.name,
              commands: [encodedInterruptedCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(recoveredResult).toEqual(Either.right(retryResult));

          const terminal = yield* Effect.promise(() =>
            runInDurableObject(recoverySystemRepo, (_instance, state) => ({
              selection: state.storage.sql
                .exec<{ lastWriteIndex: number }>(
                  'SELECT lastWriteIndex FROM selection',
                )
                .one(),
              generation: state.storage.sql
                .exec<{ lastWriteIndex: number }>(
                  'SELECT lastWriteIndex FROM generationState WHERE generationId = ?',
                  activation.generationId,
                )
                .one(),
              writes: state.storage.sql
                .exec<{
                  writeIndex: number;
                  result: string | null;
                  deliveryAttemptCount: number;
                }>(
                  'SELECT writeIndex, result, deliveryAttemptCount FROM systemWrites WHERE writeIndex IN (5, 6) ORDER BY writeIndex',
                )
                .toArray(),
            })),
          );
          expect(terminal.selection).toEqual({ lastWriteIndex: 6 });
          expect(terminal.generation).toEqual({ lastWriteIndex: 6 });
          expect(terminal.writes.map(row => row.writeIndex)).toEqual([5, 6]);
          expect(terminal.writes.map(row => row.deliveryAttemptCount)).toEqual([
            2, 1,
          ]);
          expect(terminal.writes[0]?.result).toBe(terminal.writes[1]?.result);

          const committedAfterRetry = yield* Effect.promise(() =>
            runInDurableObject(recoveryAggregateRepo, (_instance, state) => ({
              outcomes: state.storage.sql
                .exec<{
                  commandId: string;
                  commandBytes: string;
                  writeIndex: number;
                }>(
                  'SELECT commandId, commandBytes, writeIndex FROM aggregateCommandOutcomes WHERE commandId = ?',
                  encodedInterruptedCommand.id,
                )
                .toArray(),
              blocks: state.storage.sql
                .exec<{ writeIndex: number }>(
                  'SELECT writeIndex FROM aggregateBlockOutbox WHERE writeIndex IN (5, 6)',
                )
                .toArray(),
            })),
          );
          expect(committedAfterRetry.outcomes).toEqual(
            committedBeforeRecovery.outcomes,
          );
          expect(committedAfterRetry.blocks).toEqual([{ writeIndex: 5 }]);
        }),
      120_000,
    );
  });
});
