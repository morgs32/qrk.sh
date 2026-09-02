import { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeDrizzleSchemasRecordFromTables } from '@zerospin/core/drizzle/makeDrizzleSchemas';
import type { IModels } from '@zerospin/core/models/types';
import { ServiceFrontendFinalizedCommandSchema } from '@zerospin/core/serviceSession/ServiceFrontendCommandSchema';
import { ZerospinError } from '@zerospin/error';
import {
  makeTable,
  PrimitiveKind,
  primitives,
  type IAnyShape,
  type IAnyTables,
} from '@zerospin/schema';
import { Effect } from 'effect';

export const materializedServiceFrontendRepoTables = {
  executionClaims: makeTable({
    name: 'executionClaims',
    shape: {
      serviceIndex: primitives.integer({ primaryKey: true }),
      commandId: primitives.text({ unique: true }),
      canonicalBytes: primitives.text(),
      command: primitives.json({ schema: ServiceChainedCommandSchema }),
      claimedAt: primitives.date(),
      completedAt: primitives.date({ nullable: true }),
      result: primitives.json({
        schema: ServiceFrontendFinalizedCommandSchema,
        nullable: true,
      }),
    },
  }),
  materializationState: makeTable({
    name: 'materializationState',
    shape: {
      id: primitives.integer({ primaryKey: true }),
      serviceIndex: primitives.integer(),
      serviceFrontendIndex: primitives.integer(),
    },
  }),
  finalizedCommandOutbox: makeTable({
    name: 'finalizedCommandOutbox',
    shape: {
      serviceFrontendIndex: primitives.integer({ primaryKey: true }),
      serviceIndex: primitives.integer({ unique: true }),
      commandId: primitives.text({ unique: true }),
      canonicalBytes: primitives.text(),
      command: primitives.json({
        schema: ServiceFrontendFinalizedCommandSchema,
      }),
      publishedAt: primitives.date({ nullable: true }),
      failure: primitives.text({ nullable: true }),
    },
  }),
} satisfies IAnyTables;

export const materializedServiceFrontendRepoDrizzleSchemas =
  makeDrizzleSchemasRecordFromTables(materializedServiceFrontendRepoTables);

export const makeMaterializedServiceFrontendRepoDbConfig = Effect.fn(
  'MaterializedServiceFrontendRepo.makeDbConfig',
)(function* (props: { serviceModels: IModels; frontendModels: IModels }) {
  const projectionTables: IAnyTables = {};
  for (const model of Object.values(props.frontendModels)) {
    projectionTables[model.modelName] = model.table;
  }

  const serviceSourceTables: IAnyTables = {};
  const serviceSourceShapes: Record<string, IAnyShape> = {};
  const physicalTableNames: Record<string, string> = {};
  for (const model of Object.values(props.serviceModels)) {
    const sourceTableKey = `serviceSource_${model.modelName}`;
    const sourceShape: IAnyShape = {};
    serviceSourceShapes[model.modelName] = sourceShape;
    serviceSourceTables[sourceTableKey] = {
      ...model.table,
      shape: sourceShape,
    };
    physicalTableNames[sourceTableKey] = sourceTableKey;
  }
  for (const model of Object.values(props.serviceModels)) {
    const sourceShape = serviceSourceShapes[model.modelName];
    if (sourceShape === undefined) {
      return yield* new ZerospinError({
        code: 'materialized-service-frontend-source-shape-missing',
        message: `Source shape for service model ${model.modelName} is missing`,
      });
    }
    const modelShape: IAnyShape = model.table.shape;
    for (const [propertyName, descriptor] of Object.entries(modelShape)) {
      if (descriptor.kind !== PrimitiveKind.Ref) {
        sourceShape[propertyName] = descriptor;
        continue;
      }
      const targetModel = props.serviceModels[descriptor.targetTableName];
      const targetSourceTable =
        serviceSourceTables[`serviceSource_${descriptor.targetTableName}`];
      if (
        targetModel === undefined ||
        targetModel.table !== descriptor.table ||
        targetSourceTable === undefined
      ) {
        return yield* new ZerospinError({
          code: 'materialized-service-frontend-source-ref-target-missing',
          message: `Source ref ${model.modelName}.${propertyName} targets an unregistered service model`,
        });
      }
      sourceShape[propertyName] = { ...descriptor, table: targetSourceTable };
    }
  }

  return makeDbConfig({
    tables: {
      ...projectionTables,
      ...materializedServiceFrontendRepoTables,
      ...serviceSourceTables,
    },
    physicalTableNames,
  });
});
