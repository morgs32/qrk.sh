import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeModelMutations } from '@zerospin/core/contracts/make/makeModelMutations';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import type { IAnyModels } from '@zerospin/core/models/types';
import config from 'config';
import { Effect, Result, Schema } from 'effect';
import { expect, it } from 'vitest';

import { makeActorSnapshotDb } from '../../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';
import { serviceVersionRepoDbConfig } from '../serviceVersionRepoDbConfig.js';

import { executeCommandsTx } from './executeCommandsTx.js';

it('retains applied service mutations with forward and inverse operations', async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const service = config.system.services.app?.['1.0.0'];
      if (service === undefined) throw new Error('Missing service fixture');
      const registered: IAnyModels = service.models;
      const product = registered.product;
      if (product === undefined) throw new Error('Missing product model');
      const { db } = yield* makeActorSnapshotDb(
        makeResourceDbConfig({
          models: service.models,
          otherTables: serviceVersionRepoDbConfig.tables,
        }),
      );
      const startedAt = new Date('2026-09-25T12:00:00.000Z');
      const mutation = yield* makeModelMutations(product).create({
        resourceId: 'prd_one',
        attributes: { name: 'One' },
      });
      const command = Schema.decodeUnknownSync(
        Schema.toType(ServiceChainedCommandSchema),
      )({
        id: 'cmd_one',
        commandName: 'createProduct',
        payload: '{"id":"prd_one","name":"One"}',
        contractVersion: '1.0.0',
        serviceName: 'app',
        serviceVersion: '1.0.0',
        serviceIndex: 1,
        dispositionHash: null,
        admission: { status: 'succeeded', startedAt, completedAt: startedAt },
        execution: { status: 'pending' },
      });
      const context = yield* config.system.runtime.contextEffect;
      yield* executeCommandsTx(db, {
        cursor: 0,
        service,
        key: {
          systemId: 'sys_one',
          serviceName: 'app',
          serviceVersion: '1.0.0',
        },
        inputs: [
          {
            command,
            startedAt,
            prepared: Result.succeed({
              payload: { id: 'prd_one', name: 'One' },
              mutations: [mutation],
            }),
          },
        ],
      }).pipe(Effect.provideContext(context));
      const rows = db
        .select()
        .from(serviceVersionRepoDbConfig.schema.mutations)
        .all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: '1/0',
        serviceIndex: 1,
        commandId: 'cmd_one',
        mutationIndex: 0,
        modelName: 'product',
        modelVersion: '1.0.0',
        resourceId: 'prd_one',
        operationName: 'create',
        inverseOperation: 'null',
      });
      expect(JSON.parse(rows[0]?.operation ?? '')).toMatchObject({
        encodedAttributes: { name: 'One' },
      });
    }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
  );
});
