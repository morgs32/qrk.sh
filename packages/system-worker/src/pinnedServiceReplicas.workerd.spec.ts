import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  abortAllDurableObjects,
  env,
  runInDurableObject,
} from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import { system } from 'system';
import { expect, it } from 'vitest';

import { AggregateChain } from './AggregateChain/AggregateChain.js';
import { ServiceAdmittedChain } from './ServiceAdmittedChain/ServiceAdmittedChain.js';
import { UserVersionedAggregateChain } from './UserVersionedAggregateChain/UserVersionedAggregateChain.js';
import { UserVersionedAggregateRepo } from './UserVersionedAggregateRepo/UserVersionedAggregateRepo.js';
import { VersionedAggregateChain } from './VersionedAggregateChain/VersionedAggregateChain.js';
import { VersionedAggregateRepo } from './VersionedAggregateRepo/VersionedAggregateRepo.js';
import { versionedAggregateRepoDbConfig } from './VersionedAggregateRepo/versionedAggregateRepoDbConfig.js';
import { VersionedServiceChain } from './VersionedServiceChain/VersionedServiceChain.js';
import { VersionedServiceRepo } from './VersionedServiceRepo/VersionedServiceRepo.js';

it('initializes before guards and delivers pinned updates and tombstones independently through cold recovery', async () => {
  const key = {
    systemId: env.ZEROSPIN_SYSTEM_ID,
    aggregateId: 'acct_pinned',
    aggregateName: 'user',
    aggregateVersion: '1.0.0',
  };
  const view = { ...key, userId: 'usr_pinned' };
  const serviceKey = {
    systemId: key.systemId,
    serviceName: 'app',
    serviceVersion: '1.0.0',
  };
  await Effect.runPromise(
    Effect.gen(function* () {
      const source = yield* ServiceAdmittedChain.getRepo({ key: serviceKey });
      const service = yield* VersionedServiceRepo.getRepo({
        key: serviceKey,
      });
      const created = yield* makeAsync(() =>
        source.admitServiceCommand({
          command: Schema.decodeUnknownSync(EncodedServiceCommandSchema)({
            id: 'cmd_pinned_create',
            serviceVersion: '1.0.0',
            serviceName: 'app',
            commandName: 'createProduct',
            contractVersion: '1.0.0',
            payload: JSON.stringify({
              id: 'prd_pinned',
              name: 'Authoritative product',
            }),
          }),
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      yield* makeAsync(() => service.flush(created.serviceIndex)).pipe(
        Effect.flatMap(decodeRpc),
      );

      const admitted = yield* AggregateChain.getRepo({ key });
      const receipt = yield* makeAsync(() =>
        admitted.admitCommands({
          commands: [
            Schema.decodeUnknownSync(EncodedAggregateCommandSchema)({
              id: 'cmd_pinned_replicate',
              commandName: 'replicateProduct',
              contractVersion: '1.0.0',
              aggregateId: key.aggregateId,
              aggregateVersion: '1.0.0',
              aggregateName: 'user',
              systemName: 'system-worker',
              userId: null,
              sessionId: null,
              frontendName: null,
              pushIndex: null,
              payload: JSON.stringify({
                product: JSON.stringify({
                  id: 'prd_pinned',
                  modelName: 'product',
                  version: '1.0.0',
                  name: 'guard-require-authoritative-copy',
                  createdAt: new Date(1).toISOString(),
                  updatedAt: new Date(1).toISOString(),
                }),
              }),
            }),
          ],
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      const aggregateRepo = yield* VersionedAggregateRepo.getRepo({ key });
      yield* makeAsync(() =>
        aggregateRepo.flush(receipt[0]!.aggregateIndex),
      ).pipe(Effect.flatMap(decodeRpc));
      const final = yield* VersionedAggregateChain.getRepo({ key });
      const first = yield* makeAsync(async () =>
        (await final.replicaFanoutQueue).getPage({ afterIndex: 0 }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(JSON.parse(first.rows[0]!.entry).command.failure).toBeNull();
      const replica = yield* UserVersionedAggregateRepo.getRepo({
        key: view,
      });
      const initial = yield* makeAsync(() =>
        replica.getState({
          ...view,
          frontendName: 'main',
          outstandingCommandIds: [],
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(
        initial.resources.find(row => row.id === 'prd_pinned'),
      ).toMatchObject({ name: 'Authoritative product' });
      expect(initial.aggregateIndex).toBe(1);
      expect(initial.userIndex).toBe(2);

      const updated = yield* makeAsync(() =>
        source.admitServiceCommand({
          command: Schema.decodeUnknownSync(EncodedServiceCommandSchema)({
            id: 'cmd_pinned_update',
            serviceVersion: '1.0.0',
            serviceName: 'app',
            commandName: 'updateProduct',
            contractVersion: '1.1.0',
            payload: JSON.stringify({
              id: 'prd_pinned',
              name: 'Updated product',
            }),
          }),
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(updated.serviceIndex).toBe(2);
      yield* makeAsync(() =>
        expect
          .poll(
            async () => {
              const state = await Effect.runPromise(
                makeAsync(() =>
                  replica.getState({
                    ...view,
                    frontendName: 'main',
                    outstandingCommandIds: [],
                  }),
                ).pipe(Effect.flatMap(decodeRpc), Effect.provide(AsyncLive)),
              );
              return state.resources.find(row => row.id === 'prd_pinned')?.name;
            },
            { timeout: 10_000 },
          )
          .toBe('Updated product'),
      );
      // VAR and UVAR subscribe independently; one receiver does not fence the other.
      yield* makeAsync(() =>
        expect
          .poll(
            () =>
              runInDurableObject(
                aggregateRepo,
                instance =>
                  instance.db
                    .select()
                    .from(
                      system.aggregates.user['1.0.0']!.models.product
                        .drizzleSchema,
                    )
                    .get()?.name,
              ),
            { timeout: 10_000 },
          )
          .toBe('Updated product'),
      );
      expect(
        (yield* makeAsync(async () =>
          (await admitted.versionedAggregateFanoutQueue).getPage({
            afterIndex: 0,
          }),
        ).pipe(Effect.flatMap(decodeRpc))).rows,
      ).toHaveLength(1);
      expect(
        (yield* makeAsync(async () =>
          (await final.replicaFanoutQueue).getPage({ afterIndex: 0 }),
        ).pipe(Effect.flatMap(decodeRpc))).rows,
      ).toHaveLength(1);
      const frontend = yield* UserVersionedAggregateChain.getRepo({
        key: view,
      });
      const outputs = yield* makeAsync(() =>
        frontend.getCommands({ afterUserIndex: 0 }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(
        outputs.commands.map(row => [row.aggregateIndex, row.userIndex]),
      ).toEqual([
        [1, 1],
        [1, 2],
        [1, 3],
      ]);
      expect(outputs.commands[1]?.resolution).toBeNull();
      const vsc = yield* VersionedServiceChain.getRepo({
        key: serviceKey,
      });
      const sourceRows = yield* makeAsync(async () =>
        (await vsc.replicaFanoutQueue).getPage({
          afterIndex: created.serviceIndex,
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      const subscriber = yield* makeAsync(() =>
        replica.aggregateReplicaFanoutQueueSubscriber(serviceKey),
      );
      yield* makeAsync(() =>
        subscriber.receive({
          rows: sourceRows.rows,
          lastIndex: sourceRows.lastIndex,
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(
        (yield* makeAsync(() =>
          replica.getState({
            ...view,
            frontendName: 'main',
            outstandingCommandIds: [],
          }),
        ).pipe(Effect.flatMap(decodeRpc))).userIndex,
      ).toBe(3);
    }).pipe(Effect.provide(AsyncLive)),
  );

  await abortAllDurableObjects();
  await Effect.runPromise(
    Effect.gen(function* () {
      const source = yield* ServiceAdmittedChain.getRepo({ key: serviceKey });
      const service = yield* VersionedServiceRepo.getRepo({
        key: serviceKey,
      });
      const deleted = yield* makeAsync(() =>
        source.admitServiceCommand({
          command: Schema.decodeUnknownSync(EncodedServiceCommandSchema)({
            id: 'cmd_pinned_delete',
            serviceVersion: '1.0.0',
            serviceName: 'app',
            commandName: 'deleteProduct',
            contractVersion: '1.0.0',
            payload: JSON.stringify({ id: 'prd_pinned' }),
          }),
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      yield* makeAsync(() => service.flush(deleted.serviceIndex)).pipe(
        Effect.flatMap(decodeRpc),
      );
      const replica = yield* UserVersionedAggregateRepo.getRepo({
        key: view,
      });
      yield* makeAsync(() =>
        expect
          .poll(
            async () => {
              const state = await Effect.runPromise(
                makeAsync(() =>
                  replica.getState({
                    ...view,
                    frontendName: 'main',
                    outstandingCommandIds: [],
                  }),
                ).pipe(Effect.flatMap(decodeRpc), Effect.provide(AsyncLive)),
              );
              return state.userIndex;
            },
            { timeout: 10_000 },
          )
          .toBe(4),
      );
      const aggregateRepo = yield* VersionedAggregateRepo.getRepo({ key });
      yield* makeAsync(() =>
        expect
          .poll(
            () =>
              runInDurableObject(
                aggregateRepo,
                instance =>
                  instance.db
                    .select()
                    .from(
                      system.aggregates.user['1.0.0']!.models.product
                        .drizzleSchema,
                    )
                    .get()?.deletedAt != null,
              ),
            { timeout: 10_000 },
          )
          .toBe(true),
      );
      const state = yield* makeAsync(() =>
        replica.getState({
          ...view,
          frontendName: 'main',
          outstandingCommandIds: [],
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(state.aggregateIndex).toBe(1);
      expect(
        state.resources.find(row => row.id === 'prd_pinned'),
      ).toMatchObject({ deletedAt: expect.any(Date) });
    }).pipe(Effect.provide(AsyncLive)),
  );
});

it('rolls back resource enrollment while preserving activation-declared sources when a guard rejects', async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const key = {
        systemId: env.ZEROSPIN_SYSTEM_ID,
        aggregateId: 'acct_pinned_rejected',
        aggregateName: 'user',
        aggregateVersion: '1.0.0',
      };
      const serviceKey = {
        systemId: key.systemId,
        serviceName: 'app',
        serviceVersion: '1.0.0',
      };
      const source = yield* ServiceAdmittedChain.getRepo({ key: serviceKey });
      const service = yield* VersionedServiceRepo.getRepo({
        key: serviceKey,
      });
      const created = yield* makeAsync(() =>
        source.admitServiceCommand({
          command: Schema.decodeUnknownSync(EncodedServiceCommandSchema)({
            id: 'cmd_pinned_rejected_create',
            serviceVersion: '1.0.0',
            serviceName: 'app',
            commandName: 'createProduct',
            contractVersion: '1.0.0',
            payload: JSON.stringify({
              id: 'prd_pinned_rejected',
              name: 'Authoritative product',
            }),
          }),
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      yield* makeAsync(() => service.flush(created.serviceIndex)).pipe(
        Effect.flatMap(decodeRpc),
      );
      const admitted = yield* AggregateChain.getRepo({ key });
      const receipt = yield* makeAsync(() =>
        admitted.admitCommands({
          commands: [
            Schema.decodeUnknownSync(EncodedAggregateCommandSchema)({
              id: 'cmd_pinned_rejected',
              commandName: 'replicateProduct',
              contractVersion: '1.0.0',
              aggregateId: key.aggregateId,
              aggregateVersion: '1.0.0',
              aggregateName: 'user',
              systemName: 'system-worker',
              userId: null,
              sessionId: null,
              frontendName: null,
              pushIndex: null,
              payload: JSON.stringify({
                product: JSON.stringify({
                  id: 'prd_pinned_rejected',
                  modelName: 'product',
                  version: '1.0.0',
                  name: 'guard-reject-after-copy',
                  createdAt: new Date(1).toISOString(),
                  updatedAt: new Date(1).toISOString(),
                }),
              }),
            }),
          ],
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      const aggregateRepo = yield* VersionedAggregateRepo.getRepo({ key });
      yield* makeAsync(() =>
        aggregateRepo.flush(receipt[0]!.aggregateIndex),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(
        yield* makeAsync(() =>
          runInDurableObject(aggregateRepo, instance => ({
            copies: instance.db
              .select()
              .from(
                system.aggregates.user['1.0.0']!.models.product.drizzleSchema,
              )
              .all(),
            sources: instance.db
              .select()
              .from(versionedAggregateRepoDbConfig.schema.services)
              .all(),
          })),
        ),
      ).toMatchObject({
        copies: [],
        sources: [
          {
            serviceName: 'app',
            lastIndex: created.serviceIndex,
          },
          {
            serviceName: 'inventory',
            lastIndex: 0,
          },
        ],
      });
      const final = yield* VersionedAggregateChain.getRepo({ key });
      const history = yield* makeAsync(async () =>
        (await final.replicaFanoutQueue).getPage({ afterIndex: 0 }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(JSON.parse(history.rows[0]!.entry).command.failure.code).toBe(
        'replica-guard-rejected',
      );
    }).pipe(Effect.provide(AsyncLive)),
  );
});
