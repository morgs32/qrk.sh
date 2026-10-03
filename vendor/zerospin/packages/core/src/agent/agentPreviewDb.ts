import {
  makeDrizzleSchemaFromEncodedTable,
  PrimitiveKind,
  type IAnyDrizzleSchemas,
} from '@zerospin/schema';
import {
  and,
  eq,
  getTableColumns,
  gt,
  gte,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { Schema } from 'effect';

import type {
  IAggregateActorOutput,
  IAggregateSessionSnapshot,
} from '../aggregateSession/types.ts';
import type { IDb, IDbConfig } from '../drizzle/types.ts';
import type { IEncodedResourceShape } from '../models/types.ts';
import type { IAgentSpec } from '../system/types.ts';

const checkpoint = sqliteTable('_agentCheckpoint', {
  id: integer().primaryKey(),
  executedIndex: integer().notNull(),
  executedHash: text().notNull(),
  aggregateIndex: integer().notNull(),
});
export function makeAgentDbConfig(agent: IAgentSpec): IDbConfig {
  const schema: IAnyDrizzleSchemas = { _agentCheckpoint: checkpoint };
  for (const model of Object.values(agent.models)) {
    schema[model.modelName] = makeDrizzleSchemaFromEncodedTable({
      name: model.modelName,
      shape: model.properties,
      indexes: model.indexes.map(index => ({
        ...index,
        columns: Schema.decodeUnknownSync(Schema.NonEmptyArray(Schema.String))(
          index.columns,
        ),
      })),
    });
  }
  return { schema, relations: {}, tables: {} };
}

/** Translate only the declared column operators; every value becomes a bound SQL parameter. */
export function makeAgentQuery(
  db: Pick<IDb, 'select'>,
  config: IDbConfig,
  agent: IAgentSpec,
) {
  const table = config.schema[agent.query.modelName];
  const model = agent.models[agent.query.modelName];
  if (table === undefined || model === undefined) {
    throw new Error('Agent query model is unavailable');
  }
  const conditions: SQL[] = [];
  for (const [name, filter] of Object.entries(agent.query.where ?? {})) {
    const column = getTableColumns(table)[name];
    const descriptor = model.properties[name];
    if (column === undefined || descriptor === undefined) {
      throw new Error(`Unknown query field ${name}`);
    }
    const operators = { eq, ne, gt, gte, lt, lte };
    for (const operator of ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'] as const) {
      const value = filter[operator];
      if (value !== undefined) {
        conditions.push(
          operators[operator](
            column,
            descriptor.kind === PrimitiveKind.Date
              ? new Date(String(value))
              : value,
          ),
        );
      }
    }
    if (filter.isNull !== undefined) {
      conditions.push(filter.isNull ? isNull(column) : isNotNull(column));
    }
    if (filter.isNotNull !== undefined) {
      conditions.push(filter.isNotNull ? isNotNull(column) : isNull(column));
    }
  }
  return db
    .select()
    .from(table)
    .$dynamic()
    .where(and(...conditions));
}

function resourceValues(
  agent: IAgentSpec,
  resource: IEncodedResourceShape,
): Record<string, unknown> {
  const model = agent.models[resource.modelName];
  if (model === undefined) {
    throw new Error(`Unexpected model ${resource.modelName}`);
  }
  if (resource.version !== model.version) {
    throw new Error('Resource version mismatch');
  }
  const values: Record<string, unknown> = {};
  for (const [field, descriptor] of Object.entries(model.properties)) {
    const value = resource[field];
    if (value === null && descriptor.nullable) {
      values[field] = null;
      continue;
    }
    switch (descriptor.kind) {
      case PrimitiveKind.Date:
        values[field] = Schema.decodeUnknownSync(Schema.Date)(value);
        break;
      case PrimitiveKind.Boolean:
        values[field] = Schema.decodeUnknownSync(Schema.Boolean)(value);
        break;
      case PrimitiveKind.Integer:
      case PrimitiveKind.Number:
        values[field] = Schema.decodeUnknownSync(
          Schema.Number.check(Schema.isFinite()),
        )(value);
        break;
      case PrimitiveKind.Ref:
        values[field] = Schema.decodeUnknownSync(
          descriptor.targetKind === PrimitiveKind.Integer
            ? Schema.Number
            : Schema.String,
        )(value);
        break;
      case PrimitiveKind.Enum:
        values[field] = Schema.decodeUnknownSync(
          Schema.Literals(descriptor.values),
        )(value);
        break;
      default:
        values[field] = Schema.decodeUnknownSync(Schema.String)(value);
    }
  }
  return values;
}

function writeResources(
  tx: Parameters<Parameters<IDb['transaction']>[0]>[0],
  config: IDbConfig,
  agent: IAgentSpec,
  resources: readonly IEncodedResourceShape[],
) {
  for (const resource of resources) {
    const table = config.schema[resource.modelName];
    if (table === undefined) {
      throw new Error('Invalid resource table');
    }
    const id = getTableColumns(table).id;
    if (id === undefined) {
      throw new Error('Invalid resource primary key');
    }
    const values = resourceValues(agent, resource);
    tx.insert(table)
      .values(values)
      .onConflictDoUpdate({ target: id, set: values })
      .run();
  }
}
export function applyAgentSnapshot(
  db: IDb,
  config: IDbConfig,
  agent: IAgentSpec,
  snapshot: IAggregateSessionSnapshot,
) {
  db.transaction(tx => {
    for (const [name, table] of Object.entries(config.schema)) {
      if (name !== '_agentCheckpoint') {
        tx.delete(table).run();
      }
    }
    writeResources(tx, config, agent, snapshot.resources);
    tx.insert(checkpoint)
      .values({
        id: 1,
        executedIndex: snapshot.executedIndex,
        executedHash: snapshot.executedHash,
        aggregateIndex: snapshot.aggregateIndex,
      })
      .onConflictDoUpdate({
        target: checkpoint.id,
        set: {
          executedIndex: snapshot.executedIndex,
          executedHash: snapshot.executedHash,
          aggregateIndex: snapshot.aggregateIndex,
        },
      })
      .run();
  });
}
export function readAgentCheckpoint(db: Pick<IDb, 'select'>) {
  const value = db.select().from(checkpoint).get();
  if (value === undefined) {
    throw new Error('Agent snapshot is required');
  }
  return value;
}
export function applyAgentOutput(
  db: IDb,
  config: IDbConfig,
  agent: IAgentSpec,
  output: IAggregateActorOutput,
): 'applied' | 'duplicate' {
  return db.transaction(tx => {
    const current = tx.select().from(checkpoint).get();
    if (current === undefined) {
      throw new Error('Agent snapshot is required');
    }
    if (output.executedIndex <= current.executedIndex) {
      if (
        output.executedIndex === current.executedIndex &&
        output.executedHash !== current.executedHash
      ) {
        throw new Error('Conflicting checkpoint');
      }
      return 'duplicate';
    }
    if (
      output.executedIndex !== current.executedIndex + 1 ||
      output.aggregateIndex < current.aggregateIndex
    ) {
      throw new Error('Agent output gap or regressed checkpoint');
    }
    tx.run(sql`PRAGMA defer_foreign_keys = ON`);
    writeResources(tx, config, agent, output.command.delta.upserted);
    for (const ref of output.command.delta.deleted) {
      const table = config.schema[ref.modelName];
      if (agent.models[ref.modelName] === undefined || table === undefined) {
        throw new Error('Invalid deleted resource');
      }
      const id = getTableColumns(table).id;
      if (id === undefined) {
        throw new Error('Invalid deleted resource primary key');
      }
      tx.delete(table).where(eq(id, ref.id)).run();
    }
    tx.update(checkpoint)
      .set({
        executedIndex: output.executedIndex,
        executedHash: output.executedHash,
        aggregateIndex: output.aggregateIndex,
      })
      .where(eq(checkpoint.id, 1))
      .run();
    return 'applied';
  });
}
