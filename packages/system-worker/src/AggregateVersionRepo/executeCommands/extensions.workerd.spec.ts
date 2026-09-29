import type { IAnyAggregateExtension } from '@zerospin/core/aggregate/types';
import { AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { encodeMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeModelMutations } from '@zerospin/core/contracts/make/makeModelMutations';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTableProvisioningStatements } from '@zerospin/core/drizzle/provisionDb/provisionDbTx/makeTableProvisioningSQL/makeTableProvisioningSQL';
import { env, runInDurableObject } from 'cloudflare:test';
import config from 'config';
import { Effect, Schema } from 'effect';
import { expect, it } from 'vitest';

import { genesisDispositionHash } from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import { makeDurableDb } from '../../makeDORepo/makeDurableDb.js';
import { serviceActorVersionRepoFixedDORepoConfig } from '../../ServiceActorVersionRepo/serviceActorVersionRepoFixedDORepoConfig.js';
import { aggregateVersionRepoDbConfig } from '../aggregateVersionRepoDbConfig.js';

import { executeCommandsTx } from './executeCommandsTx.js';

it('persists shared and extension mutations as one durable aggregate command', async () => {
  const aggregate = config.system.aggregates.notes?.['1.0.0'];
  if (!aggregate) throw new Error('Missing notes aggregate');
  const user = aggregate.models.user;
  if (!user) throw new Error('Missing user model');
  const dbConfig = makeResourceDbConfig({
    models: aggregate.models,
    otherTables: aggregateVersionRepoDbConfig.tables,
  });
  const name = await Effect.runPromise(
    serviceActorVersionRepoFixedDORepoConfig.nameUtils.makeName({
      systemId: env.ZEROSPIN_SYSTEM_ID,
      serviceName: 'app',
      serviceVersion: '1.0.0',
      actorName: 'default',
      actorVersion: '1.0.0',
      actorPath: '/aggregate-extension-durable-test',
    }),
  );
  const repo = env.SERVICE_ACTOR_VERSION_REPO.getByName(name);
  await runInDurableObject(repo, async (_instance, state) => {
    for (const table of Object.values(dbConfig.schema)) {
      for (const statement of makeTableProvisioningStatements(table)) {
        state.storage.sql.exec(statement);
      }
    }
    const db = makeDurableDb({ storage: state.storage, dbConfig });
    const now = new Date();
    const head = {
      singletonId: 1,
      aggregateIndex: 0,
      executedIndex: 0,
      dispositionHash: genesisDispositionHash(),
    };
    db.insert(aggregateVersionRepoDbConfig.schema.head).values(head).run();
    const command = Schema.decodeUnknownSync(
      Schema.toType(AggregateChainedCommandSchema),
    )({
      id: 'cmd_extension',
      commandName: 'createUser',
      payload: JSON.stringify({ id: 'usr_extension', name: 'shared' }),
      contractVersion: '1.0.0',
      aggregateId: 'usr_extension',
      aggregateName: 'notes',
      aggregateVersion: '1.0.0',
      systemName: 'test',
      actorName: 'test',
      actorVersion: '1.0.0',
      claims: { aggregateId: 'usr_extension' },
      nodeId: null,
      nodeIndex: null,
      sessionName: null,
      aggregateIndex: 1,
      dispositionHash: null,
      admission: { status: 'succeeded', startedAt: now, completedAt: now },
      execution: { status: 'pending' },
    });
    const created = await Effect.runPromise(
      makeModelMutations(user).create({
        resourceId: 'usr_extension',
        attributes: { name: 'shared' },
      }),
    );
    const mutation = await Effect.runPromise(
      encodeMutation({
        commandId: command.id,
        mutationIndex: 0,
        mutation: created,
      }),
    );
    const extension: IAnyAggregateExtension = Effect.fn(function* ({
      db,
      models,
    }) {
      const row = db.query.user?.findFirst().sync();
      if (!row) throw new Error('Shared user is not visible');
      return [
        yield* models.user.update({
          resourceId: row.id,
          attributes: { name: 'extended' },
        }),
      ];
    });
    const context = await config.system.runtime.runPromise(
      config.system.runtime.contextEffect,
    );
    await Effect.runPromise(
      executeCommandsTx(db, {
        head,
        aggregate: { ...aggregate, extensions: { createUser: extension } },
        key: {
          systemId: env.ZEROSPIN_SYSTEM_ID,
          aggregateId: 'usr_extension',
          aggregateName: 'notes',
          aggregateVersion: '1.0.0',
        },
        preparedPage: [
          {
            command,
            startedAt: now,
            mutations: [mutation],
            failure: null,
            contract: aggregate.contracts.createUser ?? null,
            payload: { id: 'usr_extension', name: 'shared' },
            guard: () => Effect.void,
          },
        ],
      }).pipe(Effect.provideContext(context)),
    );
    const retained = await Effect.runPromise(
      aggregateVersionRepoDbConfig.tables.aggregateCommands.decodeRow(
        db
          .select()
          .from(aggregateVersionRepoDbConfig.schema.aggregateCommands)
          .get(),
      ),
    );
    expect(retained.execution).toMatchObject({
      status: 'succeeded',
      executionDelta: { inserted: [{ id: 'usr_extension', name: 'extended' }] },
    });
    expect(db.query.user?.findFirst().sync()?.name).toBe('extended');
    expect(
      db
        .select()
        .from(aggregateVersionRepoDbConfig.schema.mutations)
        .all()
        .map(row => row.mutationIndex),
    ).toEqual([0, 1]);
  });
});
