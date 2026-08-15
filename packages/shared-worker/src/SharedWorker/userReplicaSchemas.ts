import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { makeTable } from '@zerospin/core/models/makeTable';
import { PrimitiveKind } from '@zerospin/core/models/primitiveKind';
import { primitives } from '@zerospin/core/models/primitives';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { JsonSchema7RootSchema } from '@zerospin/core/utils/JsonSchema7RootSchema';
import { Schema } from 'effect';

const encodedPrimitiveDescriptorSchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.PrimaryKey),
    nullable: Schema.Literal(false),
    unique: Schema.Literal(true),
    abbreviation: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.OpaqueId),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    abbreviation: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Ref),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    abbreviation: Schema.String,
    targetTableName: Schema.String,
    targetColumnName: Schema.String,
    relation: Schema.String,
    inverse: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Cursor),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    abbreviation: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Boolean),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optionalWith(Schema.Boolean, { exact: true }),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Integer),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optionalWith(Schema.Number, { exact: true }),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Number),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optionalWith(Schema.Number, { exact: true }),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Text),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optionalWith(Schema.NullOr(Schema.String), {
      exact: true,
    }),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Date),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optionalWith(Schema.Date, { exact: true }),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Enum),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    values: Schema.NonEmptyArray(Schema.String),
    defaultValue: Schema.optionalWith(Schema.String, { exact: true }),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Json),
    nullable: Schema.Boolean,
    schema: JsonSchema7RootSchema,
    defaultValue: Schema.optionalWith(Schema.Null, { exact: true }),
  }),
);

export const encodedShapeSchema = Schema.Record({
  key: Schema.String,
  value: encodedPrimitiveDescriptorSchema,
});

const modelIndexSchema = Schema.Struct({
  name: Schema.String,
  columns: Schema.NonEmptyArray(Schema.String),
  unique: Schema.optionalWith(Schema.Boolean, { exact: true }),
});

const modelDefinitionSchema = Schema.Struct({
  modelName: Schema.String,
  abbreviation: Schema.String,
  version: Schema.String.pipe(
    Schema.pattern(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u),
  ),
  properties: encodedShapeSchema,
  indexes: Schema.Array(modelIndexSchema),
});

export const aggregateFrontendSpecSchema = Schema.Struct({
  kind: Schema.Literal('aggregate'),
  systemName: Schema.String,
  aggregateName: Schema.String,
  frontendName: Schema.String,
  modelNames: Schema.Array(Schema.String),
  models: Schema.Record({
    key: Schema.String,
    value: Schema.extend(
      modelDefinitionSchema,
      Schema.Struct({
        historicalDefinitions: Schema.Array(
          Schema.extend(
            modelDefinitionSchema,
            Schema.Struct({ hasDirectAdapter: Schema.Boolean }),
          ),
        ),
      }),
    ),
  }),
  contracts: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      commandName: Schema.String,
      version: Schema.String,
      payloadJsonSchema: JsonSchema7RootSchema,
      historicalDefinitions: Schema.Array(
        Schema.Struct({
          commandName: Schema.String,
          version: Schema.String,
          hasDirectAdapter: Schema.Boolean,
          payloadJsonSchema: JsonSchema7RootSchema,
        }),
      ),
    }),
  }),
  aggregateFrontendLock: AggregateFrontendLockSchema,
});

export const serviceFrontendSpecSchema = Schema.Struct({
  kind: Schema.Literal('service'),
  systemName: Schema.String,
  serviceName: Schema.String,
  frontendName: Schema.String,
  modelNames: Schema.Array(Schema.String),
  models: Schema.Record({
    key: Schema.String,
    value: Schema.extend(
      modelDefinitionSchema,
      Schema.Struct({
        historicalDefinitions: Schema.mutable(
          Schema.Array(
            Schema.extend(
              modelDefinitionSchema,
              Schema.Struct({ hasDirectAdapter: Schema.Boolean }),
            ),
          ),
        ),
      }),
    ),
  }),
  contracts: Schema.Record({
    key: Schema.String,
    value: Schema.Never,
  }),
  serviceFrontendLock: ServiceFrontendLockSchema,
});

const aggregateFrontendReplicasTable = makeTable({
  name: 'aggregateFrontendReplicas',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'afrp' }),
    aggregateId: primitives.opaqueId({
      abbreviation: coreAbbreviations.aggregate,
    }),
    aggregateName: primitives.text(),
    userId: primitives.text(),
    frontendName: primitives.text(),
    aggregateFrontendLockKey: primitives.text(),
    aggregateFrontendLock: primitives.json({
      schema: AggregateFrontendLockSchema,
    }),
    frontendSpec: primitives.json({ schema: aggregateFrontendSpecSchema }),
    databaseName: primitives.text(),
    createdAt: primitives.date(),
  },
  indexes: [
    {
      name: 'aggregate_frontend_replicas_target_lock_idx',
      columns: [
        'aggregateId',
        'aggregateName',
        'userId',
        'frontendName',
        'aggregateFrontendLockKey',
      ],
      unique: true,
    },
  ],
});

const serviceFrontendReplicasTable = makeTable({
  name: 'serviceFrontendReplicas',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'sfrp' }),
    serviceName: primitives.text(),
    userId: primitives.text(),
    frontendName: primitives.text(),
    serviceFrontendLockKey: primitives.text(),
    serviceFrontendLock: primitives.json({
      schema: ServiceFrontendLockSchema,
    }),
    frontendSpec: primitives.json({ schema: serviceFrontendSpecSchema }),
    databaseName: primitives.text(),
    createdAt: primitives.date(),
  },
  indexes: [
    {
      name: 'service_frontend_replicas_target_lock_idx',
      columns: [
        'serviceName',
        'userId',
        'frontendName',
        'serviceFrontendLockKey',
      ],
      unique: true,
    },
  ],
});

export const userReplicaDbConfig = makeDbConfig({
  tables: {
    aggregateFrontendReplicas: aggregateFrontendReplicasTable,
    serviceFrontendReplicas: serviceFrontendReplicasTable,
  },
});

export const userReplicaSchemas = userReplicaDbConfig.schema;
export const { aggregateFrontendReplicas, serviceFrontendReplicas } =
  userReplicaSchemas;
