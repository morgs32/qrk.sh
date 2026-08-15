import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDeploySeedCommand } from '@zerospin/core/contracts/types';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { TraceLoggerLayer } from '@zerospin/core/test-utils/TraceLoggerLayer';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ErrorLayer } from '@zerospin/core/utils/ErrorLayer';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { env } from 'cloudflare:test';
import { Effect, Layer } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect, vi } from 'vitest';

import { AggregateRepo } from './AggregateRepo/AggregateRepo.js';
import { getAggregateRepo } from './AggregateRepo/getAggregateRepo/getAggregateRepo.js';
import { main, system } from './fixtures/system.js';
import { managedRuntime } from './managedRuntime.js';
import { getServiceRepo } from './ServiceRepo/getServiceRepo/getServiceRepo.js';
import { SystemRepo } from './SystemRepo/SystemRepo.js';
import { executeInRepo } from './workerd-utils/executeInRepo.js';

const seedCommands = vi.hoisted(
  () => new Map<string, readonly IDeploySeedCommand[]>(),
);

vi.mock('seeds', async () => {
  const { Effect } = await import('effect');
  return {
    seeds: Effect.sync(() => seedCommands.get('current') ?? []),
  };
});

const TestLayer = Layer.mergeAll(
  AsyncLive,
  makePrefixedIncrementalIdFactory('seededGenerationBootstrap'),
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
);

describe('SystemRepo seeded generation bootstrap', () => {
  it.layer(TestLayer)(it => {
    it.effect('finalizes aggregate and service seeds before atomic open', () =>
      Effect.gen(function* () {
        const aggregateId = makeAggregateId({ id: 'seeded-bootstrap' });
        const userId =
          system.aggregates.user.models.user.prefixId('seeded-bootstrap');
        const productId =
          system.services.app.models.product.prefixId('seeded-bootstrap');
        const aggregateSeed = yield* system.aggregates.user.makeCommand({
          contractName: 'createUser',
          aggregateId,
          systemName: system.name,
          payload: {
            id: userId,
            name: 'Seeded bootstrap user',
          },
        });
        const serviceSeed = yield* system.services.app.makeCommand({
          contractName: 'createProduct',
          payload: {
            id: productId,
            name: 'Seeded bootstrap product',
          },
        });
        seedCommands.set('current', [aggregateSeed, serviceSeed]);

        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        let deployed = yield* makeAsync(() =>
          systemRepo.startDeploy({ clean: true }),
        ).pipe(Effect.flatMap(decodeRpc));
        while (deployed.status === 'activating') {
          deployed = yield* makeAsync(() =>
            systemRepo.getDeploy({ deployId: deployed.deployId }),
          ).pipe(Effect.flatMap(decodeRpc));
        }
        expect(deployed).toMatchObject({
          status: 'succeeded',
          activationCheckpoint: 'final-replay-complete',
        });

        const users = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateRepo,
            repo: AggregateRepo,
            key: {
              generationId: deployed.generationId,
              aggregateId,
              aggregateName: main.aggregateName,
            },
            fn: ({ db, schema }) =>
              db.select().from(schema.user).orderBy(schema.user.id).all(),
          }),
        );
        expect(users).toContainEqual(
          expect.objectContaining({
            id: userId,
            modelName: 'user',
            name: 'Seeded bootstrap user',
          }),
        );

        const serviceRepo = yield* getServiceRepo({
          key: {
            generationId: deployed.generationId,
            serviceName: 'app',
          },
        });
        const serviceSnapshot = yield* makeAsync(() =>
          serviceRepo.getServiceFrontendSnapshot({
            serviceName: 'app',
            frontendName: 'products',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(serviceSnapshot.resources).toContainEqual(
          expect.objectContaining({
            id: productId,
            modelName: 'product',
            name: 'Seeded bootstrap product',
          }),
        );
        seedCommands.clear();
      }),
    );
  });
});
