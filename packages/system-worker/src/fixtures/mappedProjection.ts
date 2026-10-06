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
import { serviceVersionChainDbConfig } from '../ServiceVersionChain/serviceVersionChainDbConfig.js';

export const verifyMappedProjection = Effect.fn('verifyMappedProjection')(
  function* (props: {
    aggregate: Parameters<typeof applyExecutedCommandsTx>[1]['aggregate'];
    delivery: IResolvedExecutedCommandRow;
  }) {
    for (const owns of [false, true]) {
      for (const phase of ['succeeded', 'admission', 'execution'] as const) {
        const db = yield* makeProvisionedInMemorySqljsDb({
          dbConfig: makeResourceDbConfig({
            models: props.aggregate.models,
            otherTables: aggregateActorVersionRepoDbConfig.tables,
          }),
        });
        const decodedRow =
          yield* aggregateVersionChainDbConfig.tables.aggregateCommands.decodeRow(
            props.delivery.command,
          );
        const rejected = {
          _tag: 'ZerospinError' as const,
          code: 'projection-fixture-rejected',
          message: 'Rejected',
          status: 400,
          extra: null,
        };
        const sourceRow = {
          ...decodedRow,
          admission:
            phase === 'admission'
              ? {
                  status: 'failed' as const,
                  startedAt: new Date(10),
                  completedAt: new Date(11),
                  failure: rejected,
                }
              : decodedRow.admission,
          execution:
            phase === 'admission'
              ? {
                  status: 'skipped' as const,
                  reason: 'admission-failed' as const,
                }
              : phase === 'execution'
                ? {
                    status: 'failed' as const,
                    startedAt: new Date(12),
                    completedAt: new Date(13),
                    failure: rejected,
                  }
                : decodedRow.execution,
          nodeId: owns ? 'node_fixture' : null,
          nodeIndex: owns ? 1 : null,
          sessionName: owns ? 'owner' : null,
        };
        const command =
          yield* aggregateVersionChainDbConfig.tables.aggregateCommands.encodeRow(
            sourceRow,
          );
        const decodedCommand = yield* Schema.decodeUnknownEffect(
          Schema.toType(AggregateTerminalCommandSchema),
        )(sourceRow);
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
          inputs: [
            {
              ...props.delivery,
              command,
              decodedCommand,
              operations:
                phase === 'succeeded' ? props.delivery.operations : [],
            },
          ],
        });
        const resource = db
          .select()
          .from(props.aggregate.models.item!.drizzleSchema)
          .get();
        if (phase === 'succeeded') {
          assert.ok(resource);
          assert.equal(Reflect.get(resource, 'name'), 'mapped');
        } else {
          assert.equal(resource, undefined);
        }
        const browserRow = db
          .select()
          .from(aggregateActorVersionRepoDbConfig.schema.browserCommandOutbox)
          .get();
        assert.ok(browserRow);
        const browser =
          yield* aggregateActorVersionRepoDbConfig.tables.browserCommandOutbox.decodeRow(
            browserRow,
          );
        assert.deepEqual(
          browser.admission,
          owns ? decodedCommand.admission : null,
        );
        assert.deepEqual(
          browser.execution,
          owns ? decodedCommand.execution : null,
        );
        assert.equal(
          db
            .select()
            .from(aggregateActorVersionRepoDbConfig.schema.actorState)
            .get()?.executedIndex,
          1,
        );
      }
    }
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
  const outputs = db
    .select()
    .from(serviceActorVersionRepoDbConfig.schema.browserCommandOutbox)
    .all();
  assert.equal(outputs.length, props.deliveries.length);
  for (const [index, delivery] of props.deliveries.entries()) {
    const source = yield* serviceVersionChainDbConfig.tables.commands.decodeRow(
      delivery.command,
    );
    const row = outputs[index];
    assert.ok(row);
    const browser =
      yield* serviceActorVersionRepoDbConfig.tables.browserCommandOutbox.decodeRow(
        row,
      );
    assert.deepEqual(browser.admission, source.admission);
    assert.deepEqual(browser.execution, source.execution);
  }
  assert.deepEqual(
    db
      .select()
      .from(serviceActorVersionRepoDbConfig.schema.modelOperations)
      .all()
      .map(row => row.operationIndex),
    [0, 2],
  );
});
