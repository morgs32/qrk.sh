import assert from 'node:assert/strict';

import { AggregateTerminalCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemorySqljsDb/makeProvisionedInMemorySqljsDb';
import { Effect, Schema } from 'effect';

import { aggregateActorVersionRepoDbConfig } from '../AggregateActorVersionRepo/aggregateActorVersionRepoDbConfig.js';
import { applyExecutedCommandsTx } from '../AggregateActorVersionRepo/applyExecutedCommands/applyExecutedCommandsTx.js';
import { aggregateVersionChainDbConfig } from '../AggregateVersionChain/aggregateVersionChainDbConfig.js';
import type { IResolvedExecutedCommandRow } from '../AggregateVersionChain/types.js';
import { executeTx as projectService } from '../ServiceActorVersionRepo/execute/executeTx.js';
import { serviceActorVersionRepoDbConfig } from '../ServiceActorVersionRepo/serviceActorVersionRepoDbConfig.js';

export const verifyMappedProjection = Effect.fn('verifyMappedProjection')(
  function* (props: {
    aggregate: Parameters<typeof applyExecutedCommandsTx>[1]['aggregate'];
    delivery: IResolvedExecutedCommandRow;
  }) {
    const db = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        models: props.aggregate.models,
        otherTables: aggregateActorVersionRepoDbConfig.tables,
      }),
    });
    const decodedCommand =
      yield* aggregateVersionChainDbConfig.tables.aggregateCommands
        .decodeRow(props.delivery.command)
        .pipe(
          Effect.flatMap(
            Schema.decodeUnknownEffect(
              Schema.toType(AggregateTerminalCommandSchema),
            ),
          ),
        );
    yield* applyExecutedCommandsTx(db, {
      aggregate: props.aggregate,
      key: {
        systemId: 'sys_fixture',
        aggregateId: 'agg_one',
        aggregateName: 'fixture',
        aggregateVersion: '1.0.0',
        actorName: 'operator',
        actorVersion: '1.0.0',
        actorPath: '/',
      },
      inputs: [{ ...props.delivery, decodedCommand }],
    });
    assert.equal(
      Reflect.get(
        db.select().from(props.aggregate.models.item!.drizzleSchema).get()!,
        'name',
      ),
      'mapped',
    );
    assert.equal(
      db
        .select()
        .from(aggregateActorVersionRepoDbConfig.schema.actorState)
        .get()?.executedIndex,
      1,
    );
  },
);

export const verifyMappedServiceProjection = Effect.fn(
  'verifyMappedServiceProjection',
)(function* (props: {
  service: Parameters<typeof projectService>[1]['service'];
  deliveries: Parameters<typeof projectService>[1]['rows'];
}) {
  const db = yield* makeProvisionedInMemorySqljsDb({
    dbConfig: makeResourceDbConfig({
      models: props.service.models,
      otherTables: serviceActorVersionRepoDbConfig.tables,
    }),
  });
  yield* projectService(db, {
    service: props.service,
    rows: props.deliveries,
    key: {
      systemId: 'sys_fixture',
      serviceName: 'fixture',
      serviceVersion: '1.0.0',
      actorName: 'operator',
      actorVersion: '1.0.0',
      actorPath: '/',
    },
  });
  assert.equal(
    Reflect.get(
      db.select().from(props.service.models.item!.drizzleSchema).get()!,
      'name',
    ),
    'mapped',
  );
  assert.equal(
    db.select().from(serviceActorVersionRepoDbConfig.schema.actorState).get()
      ?.executedIndex,
    3,
  );
  assert.deepEqual(
    db
      .select()
      .from(serviceActorVersionRepoDbConfig.schema.modelOperations)
      .all()
      .map(row => row.operationIndex),
    [0, 2],
  );
});
