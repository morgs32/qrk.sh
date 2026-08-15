import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import {
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import type {
  IAggregateCommand,
  IEncodedCommand,
  IPushedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import { makeMigratedInMemorySqljsDb } from '@zerospin/core/drizzle/makeMigratedInMemorySqljsDb';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { Effect, Layer, Schema } from 'effect';
import { describe, expect, vi } from 'vitest';

import {
  AggregateRepo,
  aggregateRepoDrizzleSchemas,
} from './AggregateRepo/AggregateRepo.js';
import { finalizeAggregateCommands } from './AggregateRepo/finalizeAggregateCommands/finalizeAggregateCommands.js';
import { finalizePushBlock } from './AggregateRepo/finalizePushBlock/finalizePushBlock.js';
import { system } from './fixtures/system.js';
import { finalizeServiceCommands } from './ServiceRepo/finalizeServiceCommands/finalizeServiceCommands.js';
import { ServiceRepo } from './ServiceRepo/ServiceRepo.js';

vi.mock('seeds', () => ({ seeds: [] }));

const TestLayer = Layer.mergeAll(
  AsyncLive,
  IncrementalMonotonicFactory,
  makePrefixedIncrementalIdFactory('authored-command-revisions'),
);

describe('authored historical command revisions', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'decodes, adapts, and executes direct and pushed aggregate revisions with complete outcomes',
      () =>
        Effect.gen(function* () {
          const generationId = 'gen_authored_aggregate_revisions';
          const aggregateId = makeAggregateId({
            id: 'authored-aggregate-revisions',
          });
          const key = {
            generationId,
            aggregateId,
            aggregateName: 'user',
          };
          const values = new Map<string, unknown>();
          const storage = Object.assign(Object.create(null), {
            sql: { exec: () => [] },
            kv: {
              get: (storageKey: string) => values.get(storageKey),
              put: (storageKey: string, value: unknown) => {
                values.set(storageKey, value);
              },
            },
            transaction: <SUCCESS>(
              closure: (transaction: {
                rollback: () => void;
              }) => Promise<SUCCESS>,
            ) => closure({ rollback: () => undefined }),
          });
          const dbConfig = yield* AggregateRepo.boundDORepoConfig.getDbConfig({
            name: 'aggrepo_authored_aggregate_revisions',
            key,
            storage,
          });
          const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });
          const aggregate = system.aggregates.user;
          const now = new Date('2026-01-01T00:00:00.000Z');
          const userId = aggregate.models.user.prefixId(
            'authored-aggregate-revisions',
          );
          const listId = aggregate.models.list.prefixId(
            'authored-aggregate-revisions',
          );
          db.insert(aggregate.models.user.drizzleSchema)
            .values({
              id: userId,
              modelName: aggregate.models.user.modelName,
              name: 'Historical owner',
              version: aggregate.models.user.version,
              createdAt: now,
              updatedAt: now,
            })
            .run();
          db.insert(aggregate.models.list.drizzleSchema)
            .values({
              id: listId,
              modelName: aggregate.models.list.modelName,
              name: 'Before direct historical command',
              userId,
              version: aggregate.models.list.version,
              createdAt: now,
              updatedAt: now,
            })
            .run();

          const directPayload = JSON.stringify({
            id: listId,
            label: 'Adapted direct aggregate command',
            userId,
          });
          const directCommand = {
            id: 'cmd_historical_direct_aggregate',
            commandName: 'renameList',
            contractVersion: '1.0.0',
            payload: directPayload,
            commandType: 'aggregate',
            aggregateId,
            aggregateName: aggregate.name,
            systemName: system.name,
            sessionId: null,
            userId: null,
            frontendName: null,
            pushedCursor: null,
          } satisfies IEncodedCommand<IAggregateCommand>;
          const unsupportedDirectCommand = {
            ...directCommand,
            id: 'cmd_unsupported_direct_aggregate',
            contractVersion: '0.9.0',
          } satisfies IEncodedCommand<IAggregateCommand>;
          const directBlock = yield* finalizeAggregateCommands({
            ...key,
            writeIndex: 1,
            commands: [directCommand, unsupportedDirectCommand],
            db,
            key,
            storage,
          });

          expect(directBlock.executedCommands).toEqual([
            expect.objectContaining({
              ...directCommand,
              payload: directPayload,
              status: 'executed',
            }),
          ]);
          expect(directBlock.failedCommands).toEqual([
            expect.objectContaining({
              ...unsupportedDirectCommand,
              payload: directPayload,
              failure: expect.stringContaining(
                'contract-payload-version-unsupported',
              ),
              status: 'failed',
            }),
          ]);
          expect(
            db.select().from(aggregate.models.list.drizzleSchema).all()[0]
              ?.name,
          ).toBe('Adapted direct aggregate command');

          const pushedPayload = JSON.stringify({
            id: listId,
            label: 'Adapted pushed aggregate command',
            userId,
          });
          const pushedCommand = {
            id: 'cmd_historical_pushed_aggregate',
            commandName: 'renameList',
            contractVersion: '1.0.0',
            payload: pushedPayload,
            commandType: 'frontend',
            aggregateId,
            aggregateName: aggregate.name,
            systemName: system.name,
            sessionId: 'sesn_historical_pushed_aggregate',
            userId,
            frontendName: 'main',
            stagedCursor: 'stcur_historical_pushed_aggregate',
            stagedAt: now,
            replicaIndex: 1,
            pushedCursor: 'pcur_historical_pushed_aggregate',
            pushedAt: now,
            status: 'pushed',
          } satisfies IEncodedCommand<IPushedCommand>;
          const unsupportedPushedCommand = {
            ...pushedCommand,
            id: 'cmd_unsupported_pushed_aggregate',
            contractVersion: '0.9.0',
            replicaIndex: 2,
            stagedCursor: 'stcur_unsupported_pushed_aggregate',
            pushedCursor: 'pcur_unsupported_pushed_aggregate',
          } satisfies IEncodedCommand<IPushedCommand>;
          yield* finalizePushBlock({
            generationId,
            aggregateId,
            aggregateName: aggregate.name,
            pushBlock: {
              writeIndex: 2,
              guardedAtAggregateCursor: directBlock.lastAggregateCursor,
              pendingCommands: [],
              pushedCommands: [pushedCommand, unsupportedPushedCommand],
              executedCommands: [],
              failedStagedCommands: [],
              failedPushedCommands: [],
            },
            db,
            storage,
          });

          const pushedOutcomes = db
            .select()
            .from(aggregateRepoDrizzleSchemas.aggregateCommandOutcomes)
            .all()
            .filter(
              row =>
                row.commandId === pushedCommand.id ||
                row.commandId === unsupportedPushedCommand.id,
            )
            .map(row =>
              Schema.decodeUnknownSync(
                Schema.parseJson(
                  Schema.Union(
                    ExecutedPushedCommandSchema,
                    FailedPushedCommandSchema,
                  ),
                ),
              )(row.command),
            );
          expect(pushedOutcomes).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                ...pushedCommand,
                payload: pushedPayload,
                status: 'executed',
              }),
              expect.objectContaining({
                ...unsupportedPushedCommand,
                payload: pushedPayload,
                failure: expect.stringContaining(
                  'contract-payload-version-unsupported',
                ),
                status: 'failed',
              }),
            ]),
          );
          expect(
            db.select().from(aggregate.models.list.drizzleSchema).all()[0]
              ?.name,
          ).toBe('Adapted pushed aggregate command');
        }),
    );

    it.effect(
      'decodes, adapts, and executes a service revision with complete outcomes',
      () =>
        Effect.gen(function* () {
          const generationId = 'gen_authored_service_revisions';
          const service = system.services.app;
          const storage = Object.assign(Object.create(null), {
            sql: { exec: () => [] },
          });
          const dbConfig = yield* ServiceRepo.boundDORepoConfig.getDbConfig({
            name: 'svcrepo_authored_service_revisions',
            key: { generationId, serviceName: service.name },
            storage,
          });
          const db = yield* makeMigratedInMemorySqljsDb({ dbConfig });
          const now = new Date('2026-01-01T00:00:00.000Z');
          const productId = service.models.product.prefixId(
            'authored-service-revisions',
          );
          db.insert(service.models.product.drizzleSchema)
            .values({
              id: productId,
              modelName: service.models.product.modelName,
              name: 'Before historical service command',
              version: service.models.product.version,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
            })
            .run();

          const payload = JSON.stringify({
            id: productId,
            label: 'Adapted service command',
          });
          const command = {
            id: 'cmd_historical_direct_service',
            commandName: 'updateProduct',
            contractVersion: '1.0.0',
            payload,
            commandType: 'service',
            serviceName: service.name,
          } satisfies IEncodedCommand<IServiceCommand>;
          const unsupportedCommand = {
            ...command,
            id: 'cmd_unsupported_direct_service',
            contractVersion: '0.9.0',
          } satisfies IEncodedCommand<IServiceCommand>;
          const finalized = yield* finalizeServiceCommands({
            writeIndex: 1,
            serviceName: service.name,
            commands: [command, unsupportedCommand],
            db,
            key: { generationId, serviceName: service.name },
          });

          expect(finalized.executedCommands).toEqual([
            expect.objectContaining({
              ...command,
              payload,
              status: 'executed',
            }),
          ]);
          expect(finalized.failedCommands).toEqual([
            expect.objectContaining({
              ...unsupportedCommand,
              payload,
              failure: expect.stringContaining(
                'contract-payload-version-unsupported',
              ),
              status: 'failed',
            }),
          ]);
          expect(
            db.select().from(service.models.product.drizzleSchema).all()[0]
              ?.name,
          ).toBe('Adapted service command');
        }),
    );
  });
});
