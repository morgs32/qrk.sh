import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import { makeTableProvisioningStatements } from '@zerospin/core/drizzle/provisionDb/provisionDbTx/makeTableProvisioningSQL/makeTableProvisioningSQL';
import { DurableObject } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';

import type { aggregateChainDbConfig } from '../AggregateChain/aggregateChainDbConfig.js';
import { aggregateVersionRepoDbConfig } from '../AggregateVersionRepo/aggregateVersionRepoDbConfig.js';
import { deleteDeliveredAggregateMaterial } from '../AggregateVersionRepo/deleteDeliveredAggregateMaterial.js';
import { forwardCommand } from '../forwardedCommands.js';
import { makeDurableDb } from '../makeDORepo/makeDurableDb.js';
import { readExecutedCommandsPage } from '../ServiceVersionRepo/readExecutedCommandsPage.js';
import { serviceVersionRepoDbConfig } from '../ServiceVersionRepo/serviceVersionRepoDbConfig.js';

const command = {
  id: 'cmd_origin',
  commandName: 'change',
  payload: '{"original":true}',
  contractVersion: '1.0.0',
  serviceName: 'catalog',
  serviceVersion: '1.0.0',
  serviceIndex: 7,
  executionVersion: '1.0.0',
  asyncInput: null,
  dispositionHash: '0'.repeat(64),
  caller: null,
  admission: JSON.stringify({
    status: 'succeeded',
    startedAt: new Date(0),
    completedAt: new Date(1),
  }),
  execution: JSON.stringify({
    status: 'succeeded',
    contractVersion: '1.0.0',
    startedAt: new Date(1),
    completedAt: new Date(2),
    result: { private: true },
  }),
};
const config = makeDbConfig({
  tables: { ...serviceVersionRepoDbConfig.tables },
});
type FixtureEnv = {
  HISTORY: DurableObjectNamespace<CommandHistory>;
  PENDING: DurableObjectNamespace<PendingAggregateHistory>;
};
function provision(
  ctx: DurableObjectState,
  tables:
    | typeof config.schema
    | typeof aggregateChainDbConfig.schema
    | typeof aggregateVersionRepoDbConfig.schema,
) {
  if (
    ctx.storage.sql
      .exec(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'executedCommandOutbox'",
      )
      .toArray().length > 0
  ) {
    return;
  }
  ctx.storage.transactionSync(() => {
    for (const table of Object.values(tables)) {
      for (const statement of makeTableProvisioningStatements(table)) {
        ctx.storage.sql.exec(statement);
      }
    }
  });
}
export class CommandHistory extends DurableObject<FixtureEnv> {
  override async fetch(request: Request) {
    provision(this.ctx, config.schema);
    const db = makeDurableDb({ storage: this.ctx.storage, dbConfig: config });
    if (new URL(request.url).pathname === '/commit') {
      await Effect.runPromise(
        makeTx('fixture.commit')(function* (tx) {
          tx.insert(config.schema.commands)
            .values({ ...command, executedIndex: 1 })
            .run();
          tx.insert(config.schema.modelOperations)
            .values({
              commandId: command.id,
              operationIndex: 0,
              modelName: 'product',
              modelVersion: '1.0.0',
              resourceId: 'prd_one',
              operationName: 'update',
              body: '{"encodedAttributes":{"price":20}}',
              committedAt: new Date(2),
              serviceIndex: 7,
            })
            .run();
          tx.insert(config.schema.executedCommandOutbox)
            .values({
              ...forwardCommand({ ...command, executedIndex: 1 }),
              serviceIndex: 7,
              executedIndex: 1,
              lastDeliveryFailure: null,
            })
            .run();
        })(db),
      );
    }
    return Response.json({
      publications: readExecutedCommandsPage(db),
      commands: db.select().from(config.schema.commands).all(),
      operations: db.select().from(config.schema.modelOperations).all(),
    });
  }
}
/** Two destinations share replay material; either acknowledgement may survive a restart first. */
export class PendingAggregateHistory extends DurableObject<FixtureEnv> {
  override async fetch(request: Request) {
    const tables = aggregateVersionRepoDbConfig.schema;
    provision(this.ctx, tables);
    const db = makeDurableDb({
      storage: this.ctx.storage,
      dbConfig: aggregateVersionRepoDbConfig,
    });
    const path = new URL(request.url).pathname;
    if (path === '/commit') {
      await Effect.runPromise(
        makeTx('fixture.enqueueBoth')(function* (tx) {
          const row =
            yield* aggregateVersionRepoDbConfig.tables.executedCommandOutbox.encodeRow(
              {
                id: 'cmd_aggregate',
                commandName: 'change',
                contractVersion: '1.0.0',
                payload: '{"original":true}',
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
                admission: {
                  status: 'succeeded',
                  startedAt: new Date(0),
                  completedAt: new Date(1),
                },
                execution: {
                  status: 'succeeded',
                  contractVersion: '1.0.0',
                  startedAt: new Date(1),
                  completedAt: new Date(2),
                  result: null,
                },
                dispositionHash: '0'.repeat(64),
                originalExecutionVersion: '1.0.0',
                executionVersion: '1.0.0',
                executedIndex: 1,
                aggregateIndex: 1,
                lastDeliveryFailure: null,
              },
            );
          tx.insert(tables.executedCommandOutbox).values(row).run();
          tx.insert(tables.executedAggregateCommandOutbox).values(row).run();
          tx.insert(tables.modelOperations)
            .values({
              executedIndex: 1,
              commandId: row.id,
              operationIndex: 0,
              modelName: 'product',
              modelVersion: '1.0.0',
              resourceId: 'prd_one',
              operationName: 'update',
              body: '{"encodedAttributes":{"price":20}}',
              committedAt: new Date(2),
            })
            .run();
        })(db),
      );
    }
    if (path === '/ack/version' || path === '/ack/original') {
      db.transaction(tx => {
        const table =
          path === '/ack/version'
            ? tables.executedCommandOutbox
            : tables.executedAggregateCommandOutbox;
        tx.delete(table).where(eq(table.executedIndex, 1)).run();
        deleteDeliveredAggregateMaterial(tx, [1]);
      });
    }
    return Response.json({
      version: db.select().from(tables.executedCommandOutbox).all(),
      original: db.select().from(tables.executedAggregateCommandOutbox).all(),
      operations: db.select().from(tables.modelOperations).all(),
    });
  }
}
export const worker = {
  async fetch(request: Request, env: FixtureEnv) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/pending/')) {
      const [, name, ...parts] = url.pathname.split('/');
      if (name === undefined) {
        return new Response('Missing fixture name', { status: 400 });
      }
      return env.PENDING.get(env.PENDING.idFromName(name)).fetch(
        new Request(new URL('/' + parts.join('/'), url.origin), request),
      );
    }
    return env.HISTORY.get(env.HISTORY.idFromName('fixture')).fetch(request);
  },
};
