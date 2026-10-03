import assert from 'node:assert/strict';

import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IAggregateActorOutput } from '@zerospin/core/aggregateSession/types';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/make/makeProvisionedInMemorySqljsDb/makeProvisionedInMemorySqljsDb';
import { Effect } from 'effect';

import { aggregateActorVersionChainDbConfig } from '../AggregateActorVersionChain/aggregateActorVersionChainDbConfig.js';
import { getActorOutputs } from '../AggregateActorVersionChain/getActorOutputs/getActorOutputs.js';
import { getResolvedThrough } from '../AggregateActorVersionChain/getResolvedThrough.js';
import { receiveActorOutputs } from '../AggregateActorVersionChain/receiveActorOutputs/receiveActorOutputs.js';
import { aggregateActorVersionRepoDbConfig } from '../AggregateActorVersionRepo/aggregateActorVersionRepoDbConfig.js';
import {
  commandRowInput,
  readPendingActorCommands,
} from '../AggregateActorVersionRepo/retainedCommands.js';
import { getNodeOutcomes } from '../ServiceActorVersionChain/getNodeOutcomes.js';
import { serviceActorVersionChainDbConfig } from '../ServiceActorVersionChain/serviceActorVersionChainDbConfig.js';

/** Exercise retained server replay with projection progress ahead of the node's private outcome journal. */
export const verifyActorDelivery = Effect.fn('verifyActorDelivery')(
  function* () {
    const db = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: aggregateActorVersionChainDbConfig,
    });
    const failure = {
      _tag: 'ZerospinError' as const,
      code: 'private',
      message: 'Private',
      status: 400,
      extra: null,
    };
    const lock: IAggregateSessionLock = {
      sessionName: 'session',
      actorName: 'actor',
      actorVersion: '1.0.0',
      claims: { claimsJsonSchema: {} },
      contracts: {},
      models: {},
    };
    const definition = { name: 'session', claims: { subject: 'one' }, lock };
    for (let index = 1; index <= 5; index++) {
      const own = index === 1 || index === 3;
      const id = index === 4 ? 'cmd_1' : (`cmd_${index}` as const);
      const output: IAggregateActorOutput = {
        executedIndex: index,
        aggregateIndex: index,
        executedHash: index.toString(16).padStart(64, '0'),
        command: {
          id,
          commandName: 'change',
          failure: index === 1 || index === 2 ? failure : null,
          delta: {
            upserted: [],
            deleted:
              index === 2 ? [{ modelName: 'secret', id: 'itm_secret' }] : [],
          },
        },
      };
      const row =
        yield* aggregateActorVersionChainDbConfig.tables.browserCommands.encodeRow(
          {
            executedIndex: index,
            aggregateIndex: index,
            executedHash: output.executedHash,
            ...output.command,
            completionNodeId: own
              ? 'node_one'
              : index === 2
                ? 'node_other'
                : null,
            completionNodeIndex: own
              ? index === 1
                ? 1
                : 2
              : index === 2
                ? 1
                : null,
            completionSessionName: own || index === 2 ? 'session' : null,
            completionClaims: own
              ? definition.claims
              : index === 2
                ? { subject: 'other' }
                : null,
            lastDeliveryFailure: null,
          },
        );
      db.insert(aggregateActorVersionChainDbConfig.schema.browserCommands)
        .values(row)
        .run();
    }
    const producer = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: aggregateActorVersionRepoDbConfig,
    });
    const deliveries = db
      .select()
      .from(aggregateActorVersionChainDbConfig.schema.browserCommands)
      .all();
    producer
      .insert(aggregateActorVersionRepoDbConfig.schema.browserCommandOutbox)
      .values(deliveries)
      .run();
    yield* receiveActorOutputs({ db, rows: deliveries, broadcast: () => {} });
    producer
      .delete(aggregateActorVersionRepoDbConfig.schema.browserCommandOutbox)
      .run();
    yield* receiveActorOutputs({ db, rows: deliveries, broadcast: () => {} });
    assert.equal(
      producer
        .select()
        .from(aggregateActorVersionRepoDbConfig.schema.browserCommandOutbox)
        .all().length,
      0,
    );
    assert.equal(
      yield* getResolvedThrough({
        db,
        nodeId: 'node_one',
        sessionName: 'session',
        claims: definition.claims,
        throughExecutedIndex: 5,
      }),
      2,
    );
    assert.equal(
      yield* getResolvedThrough({
        db,
        nodeId: 'node_one',
        sessionName: 'session',
        claims: definition.claims,
        throughExecutedIndex: 1,
      }),
      1,
    );
    console.log(
      'PASS: browser delivery deletion preserves receiving history and snapshot outcome prefixes',
    );
    const stagedInput = {
      id: 'cmd_staged' as const,
      commandName: 'change',
      contractVersion: '1.0.0',
      payload: '{}',
      asyncInput: null,
      aggregateId: 'agg_one',
      aggregateName: 'order',
      aggregateVersion: '1.0.0',
      systemName: 'fixture',
      actorName: 'operator',
      actorVersion: '1.0.0',
      claims: {},
      nodeId: null,
      nodeIndex: null,
      sessionName: null,
    };
    const retained =
      yield* aggregateActorVersionRepoDbConfig.tables.commands.encodeRow(
        commandRowInput({ rowId: 'row_staged', command: stagedInput }),
      );
    producer
      .insert(aggregateActorVersionRepoDbConfig.schema.commands)
      .values(retained)
      .run();
    const stage =
      yield* aggregateActorVersionRepoDbConfig.tables.stagedCommands.encodeRow({
        stageIndex: 1,
        commandRowId: 'row_staged',
        stagedAt: new Date(0),
        operations: [],
        resolvedAt: null,
      });
    producer
      .insert(aggregateActorVersionRepoDbConfig.schema.stagedCommands)
      .values(stage)
      .run();
    producer
      .insert(
        aggregateActorVersionRepoDbConfig.schema.stagedAggregateCommandOutbox,
      )
      .values({ ...retained, ...stage, lastDeliveryFailure: null })
      .run();
    producer
      .delete(
        aggregateActorVersionRepoDbConfig.schema.stagedAggregateCommandOutbox,
      )
      .run();
    const optimistic = yield* readPendingActorCommands(producer, '1.0.0');
    assert.equal(optimistic.length, 1);
    assert.equal(optimistic[0]?.id, stagedInput.id);
    assert.equal(optimistic[0]?.resolvedAt, null);
    console.log(
      'PASS: admission delivery deletion preserves unresolved staging journal and monotonic stage positions',
    );
    const historical = yield* getActorOutputs({
      db,
      afterExecutedIndex: 5,
      afterNodeIndex: 0,
      nodeId: 'node_one',
      definition,
    });
    assert.deepEqual(
      historical.outputs.map(output => output.executedIndex),
      [1, 3],
    );
    assert.equal(historical.outputs[0]?.command.failure?.code, 'private');
    assert.equal(historical.nodeThrough, 2);
    assert.equal(historical.tip, 5);
    const combined = yield* getActorOutputs({
      db,
      afterExecutedIndex: 2,
      afterNodeIndex: 0,
      nodeId: 'node_one',
      definition,
    });
    assert.deepEqual(
      combined.outputs.map(output => output.executedIndex),
      [1, 3, 4, 5],
    );
    assert.equal(combined.outputs[2]?.command.id, 'cmd_1');
    const publicPage = yield* getActorOutputs({
      db,
      afterExecutedIndex: 0,
      definition,
    });
    assert.deepEqual(
      publicPage.outputs.map(output => output.executedIndex),
      [1, 2, 3, 4, 5],
    );
    assert.ok(
      publicPage.outputs.every(
        output =>
          output.command.failure === null &&
          output.command.delta.deleted.length === 0,
      ),
    );
    assert.ok(
      publicPage.outputs.every(
        output =>
          Object.keys(output.command).sort().join(',') ===
          'commandName,delta,failure,id',
      ),
    );
    for (const changed of [
      { ...definition, name: 'other' },
      { ...definition, claims: { subject: 'other' } },
    ]) {
      assert.equal(
        (yield* getActorOutputs({
          db,
          afterExecutedIndex: 5,
          afterNodeIndex: 0,
          nodeId: 'node_one',
          definition: changed,
        })).outputs.length,
        0,
      );
    }
    db.delete(aggregateActorVersionChainDbConfig.schema.browserCommands).run();
    const gap =
      yield* aggregateActorVersionChainDbConfig.tables.browserCommands.encodeRow(
        {
          executedIndex: 2,
          aggregateIndex: 1,
          executedHash: 'a'.repeat(64),
          id: 'cmd_gap',
          commandName: 'change',
          delta: { upserted: [], deleted: [] },
          failure: null,
          completionNodeId: null,
          completionNodeIndex: null,
          completionSessionName: null,
          completionClaims: null,
          lastDeliveryFailure: null,
        },
      );
    db.insert(aggregateActorVersionChainDbConfig.schema.browserCommands)
      .values(gap)
      .run();
    assert.equal(
      (yield* getActorOutputs({ db, afterExecutedIndex: 0 }).pipe(
        Effect.result,
      ))._tag,
      'Failure',
    );

    const serviceDb = yield* makeProvisionedInMemorySqljsDb({
      dbConfig: serviceActorVersionChainDbConfig,
    });
    for (const index of [1, 2, 3]) {
      const own = index !== 2;
      serviceDb
        .insert(serviceActorVersionChainDbConfig.schema.browserCommands)
        .values(
          yield* serviceActorVersionChainDbConfig.tables.browserCommands.encodeRow(
            {
              executedIndex: index,
              id: `cmd_${index}`,
              commandName: 'change',
              serviceIndex: own ? (index === 1 ? 1 : 2) : 1,
              serviceHash: own
                ? index === 1
                  ? 'b'.repeat(64)
                  : 'c'.repeat(64)
                : 'b'.repeat(64),
              delta: { upserted: [], deleted: [] },
              failure: index === 1 ? failure : null,
              caller: own
                ? {
                    actorName: 'actor',
                    actorVersion: '1.0.0',
                    nodeId: 'node_one',
                    nodeIndex: index === 1 ? 1 : 2,
                    sessionName: 'session',
                    claims: definition.claims,
                  }
                : null,
              lastDeliveryFailure: null,
            },
          ),
        )
        .run();
    }
    const serviceReplay = yield* getNodeOutcomes({
      db: serviceDb,
      nodeId: 'node_one',
      sessionName: 'session',
      claims: definition.claims,
      afterNodeIndex: 0,
      throughExecutedIndex: 3,
      models: {},
    });
    assert.deepEqual(
      serviceReplay.outputs.map(output => output.executedIndex),
      [1, 3],
    );
    assert.equal(serviceReplay.nodeThrough, 2);
    assert.equal(serviceReplay.outputs[0]?.command.failure?.code, 'private');
    assert.equal(
      (yield* getNodeOutcomes({
        db: serviceDb,
        nodeId: 'node_other',
        sessionName: 'session',
        claims: {},
        afterNodeIndex: 0,
        throughExecutedIndex: 3,
        models: {},
      })).outputs.length,
      0,
    );
    assert.equal(
      (yield* getNodeOutcomes({
        db: serviceDb,
        nodeId: 'node_one',
        sessionName: 'other',
        claims: definition.claims,
        afterNodeIndex: 0,
        throughExecutedIndex: 3,
        models: {},
      }).pipe(Effect.result))._tag,
      'Failure',
    );
    console.log(
      'PASS: actor replay suffix plus historical node outcomes, private failures, model-lock filtering, repeated IDs, empty positions and gap rejection',
    );
  },
);
