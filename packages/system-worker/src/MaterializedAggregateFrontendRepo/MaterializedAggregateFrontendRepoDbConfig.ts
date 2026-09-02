import { AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeDrizzleSchemasRecordFromTables } from '@zerospin/core/drizzle/makeDrizzleSchemas';
import type { IModels } from '@zerospin/core/models/types';
import {
  AggregateFrontendFinalizedCommandSchema,
  AggregateFrontendPushedCommandSchema,
  SessionCommandSchema,
} from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { ZerospinError } from '@zerospin/error';
import {
  makeTable,
  PrimitiveKind,
  primitives,
  type IAnyShape,
  type IAnyTables,
} from '@zerospin/schema';
import { Effect, Schema } from 'effect';

export const materializedAggregateFrontendRepoTables = {
  projectionState: makeTable({
    name: 'projectionState',
    shape: {
      id: primitives.integer({ primaryKey: true }),
      systemId: primitives.text(),
      aggregateId: primitives.text(),
      aggregateName: primitives.text(),
      userId: primitives.text(),
      frontendName: primitives.text(),
      status: primitives.enum({ values: ['initializing', 'ready'] }),
      aggregateIndex: primitives.integer(),
      pushIndex: primitives.integer(),
      frontendIndex: primitives.integer(),
    },
  }),
  executionClaims: makeTable({
    name: 'executionClaims',
    shape: {
      aggregateIndex: primitives.integer({ primaryKey: true }),
      commandId: primitives.text({ unique: true }),
      canonicalBytes: primitives.text(),
      command: primitives.json({ schema: AggregateChainedCommandSchema }),
      claimedAt: primitives.date(),
      completedAt: primitives.date({ nullable: true }),
      result: primitives.json({
        schema: AggregateFrontendFinalizedCommandSchema,
        nullable: true,
      }),
    },
  }),
  pushedExecutionClaims: makeTable({
    name: 'pushedExecutionClaims',
    shape: {
      pushIndex: primitives.integer({ primaryKey: true }),
      commandId: primitives.text({ unique: true }),
      sourceCanonicalBytes: primitives.text(),
      sourceCommand: primitives.json({ schema: SessionCommandSchema }),
      chainedAt: primitives.date(),
      claimedAt: primitives.date(),
      result: primitives.json({
        schema: AggregateFrontendPushedCommandSchema,
        nullable: true,
      }),
    },
  }),
  activeOptimism: makeTable({
    name: 'activeOptimism',
    shape: {
      pushIndex: primitives.integer({ primaryKey: true }),
      commandId: primitives.text({ unique: true }),
      command: primitives.json({
        schema: AggregateFrontendPushedCommandSchema,
      }),
      forwardMutations: primitives.json({
        schema: Schema.Array(EncodedAppliedMutationSchema),
      }),
      currentInverses: primitives.json({
        schema: Schema.Array(EncodedAppliedMutationSchema),
      }),
    },
  }),
  resolvedPushes: makeTable({
    name: 'resolvedPushes',
    shape: {
      pushIndex: primitives.integer({ primaryKey: true }),
      commandId: primitives.text({ unique: true }),
    },
  }),
  finalizedCommandOutbox: makeTable({
    name: 'finalizedCommandOutbox',
    shape: {
      frontendIndex: primitives.integer({ primaryKey: true }),
      commandId: primitives.text({ unique: true }),
      canonicalBytes: primitives.text(),
      command: primitives.json({
        schema: AggregateFrontendFinalizedCommandSchema,
      }),
      publishedAt: primitives.date({ nullable: true }),
      failure: primitives.text({ nullable: true }),
    },
  }),
} satisfies IAnyTables;

export const materializedAggregateFrontendRepoDrizzleSchemas =
  makeDrizzleSchemasRecordFromTables(materializedAggregateFrontendRepoTables);

export const makeMaterializedAggregateFrontendRepoDbConfig = Effect.fn(
  'makeMaterializedAggregateFrontendRepoDbConfig',
)(function* (props: {
  aggregateName: string;
  aggregateModels: IModels;
  frontendModels: IModels;
}) {
  const projectionTables: IAnyTables = {};
  for (const model of Object.values(props.frontendModels)) {
    projectionTables[model.modelName] = model.table;
  }

  const aggregateSourceTables: IAnyTables = {};
  const aggregateSourceShapes: Record<string, IAnyShape> = {};
  const physicalTableNames: Record<string, string> = {};
  for (const model of Object.values(props.aggregateModels)) {
    const sourceTableKey = `aggregateSource_${model.modelName}`;
    const sourceShape: IAnyShape = {};
    aggregateSourceShapes[model.modelName] = sourceShape;
    aggregateSourceTables[sourceTableKey] = {
      ...model.table,
      shape: sourceShape,
    };
    physicalTableNames[sourceTableKey] = sourceTableKey;
  }

  for (const model of Object.values(props.aggregateModels)) {
    const sourceShape = aggregateSourceShapes[model.modelName];
    if (sourceShape === undefined) {
      return yield* new ZerospinError({
        code: 'materialized-aggregate-frontend-source-shape-missing',
        message: `Aggregate source shape for model "${model.modelName}" is missing`,
      });
    }
    const modelShape: IAnyShape = model.table.shape;
    for (const [propertyName, descriptor] of Object.entries(modelShape)) {
      if (descriptor.kind !== PrimitiveKind.Ref) {
        sourceShape[propertyName] = descriptor;
        continue;
      }
      const targetModel = props.aggregateModels[descriptor.targetTableName];
      const targetSourceTable =
        aggregateSourceTables[`aggregateSource_${descriptor.targetTableName}`];
      const targetSourceModel =
        targetModel !== undefined && 'sourceModel' in targetModel
          ? Reflect.get(targetModel, 'sourceModel')
          : undefined;
      const targetModelSourceTable =
        typeof targetSourceModel === 'object' && targetSourceModel !== null
          ? Reflect.get(targetSourceModel, 'table')
          : undefined;
      if (
        targetModel === undefined ||
        (targetModel.table !== descriptor.table &&
          targetModelSourceTable !== descriptor.table) ||
        targetSourceTable === undefined
      ) {
        return yield* new ZerospinError({
          code: 'materialized-aggregate-frontend-source-ref-target-missing',
          message: `Aggregate source ref ${model.modelName}.${propertyName} targets an unregistered model`,
          extra: {
            aggregateName: props.aggregateName,
            modelName: model.modelName,
            propertyName,
            targetTableName: descriptor.targetTableName,
          },
        });
      }
      sourceShape[propertyName] = {
        ...descriptor,
        table: targetSourceTable,
      };
    }
  }

  return makeDbConfig({
    tables: {
      ...projectionTables,
      ...materializedAggregateFrontendRepoTables,
      ...aggregateSourceTables,
    },
    physicalTableNames,
  });
});
