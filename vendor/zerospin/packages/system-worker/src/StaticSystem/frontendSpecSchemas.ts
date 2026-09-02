import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { PrimitiveKind } from '@zerospin/schema';
import { Schema } from 'effect';

const encodedPrimitiveDescriptorSchema = Schema.Union([
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
    defaultValue: Schema.optionalKey(Schema.Boolean),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Integer),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optionalKey(Schema.Number),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Number),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optionalKey(Schema.Number),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Text),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optionalKey(Schema.NullOr(Schema.String)),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Date),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optionalKey(Schema.DateFromString),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Enum),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    values: Schema.NonEmptyArray(Schema.String),
    defaultValue: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Json),
    nullable: Schema.Boolean,
    schema: Schema.Struct({
      dialect: Schema.Literal('draft-2020-12'),
      schema: Schema.Any,
      definitions: Schema.Record(Schema.String, Schema.Any),
    }),
    defaultValue: Schema.optionalKey(Schema.Null),
  }),
]);

const encodedShapeSchema = Schema.Record(
  Schema.String,
  encodedPrimitiveDescriptorSchema,
);

const modelIndexSchema = Schema.Struct({
  name: Schema.String,
  columns: Schema.NonEmptyArray(Schema.String),
  unique: Schema.optionalKey(Schema.Boolean),
});

const modelDefinitionSchema = Schema.Struct({
  modelName: Schema.String,
  abbreviation: Schema.String,
  version: Schema.String,
  properties: encodedShapeSchema,
  indexes: Schema.Array(modelIndexSchema),
});

const frontendModelSpecSchema = modelDefinitionSchema.pipe(
  Schema.fieldsAssign({
    historicalDefinitions: Schema.Array(
      modelDefinitionSchema.pipe(
        Schema.fieldsAssign({ hasDirectAdapter: Schema.Boolean }),
      ),
    ),
  }),
);

const frontendContractSpecSchema = Schema.Struct({
  commandName: Schema.String,
  version: Schema.String,
  payloadJsonSchema: Schema.Struct({
    dialect: Schema.Literal('draft-2020-12'),
    schema: Schema.Any,
    definitions: Schema.Record(Schema.String, Schema.Any),
  }),
  historicalDefinitions: Schema.Array(
    Schema.Struct({
      commandName: Schema.String,
      version: Schema.String,
      payloadJsonSchema: Schema.Struct({
        dialect: Schema.Literal('draft-2020-12'),
        schema: Schema.Any,
        definitions: Schema.Record(Schema.String, Schema.Any),
      }),
      hasDirectAdapter: Schema.Boolean,
    }),
  ),
});

export const AggregateFrontendControllerSpecSchema = Schema.Struct({
  kind: Schema.Literal('aggregate'),
  systemName: Schema.String,
  aggregateName: Schema.String,
  frontendName: Schema.String,
  modelNames: Schema.Array(Schema.String),
  models: Schema.Record(Schema.String, frontendModelSpecSchema),
  contracts: Schema.Record(Schema.String, frontendContractSpecSchema),
  aggregateFrontendLock: AggregateFrontendLockSchema,
});

export const ServiceFrontendControllerSpecSchema = Schema.Struct({
  kind: Schema.Literal('service'),
  systemName: Schema.String,
  serviceName: Schema.String,
  frontendName: Schema.String,
  modelNames: Schema.Array(Schema.String),
  models: Schema.Record(Schema.String, frontendModelSpecSchema),
  contracts: Schema.Record(Schema.String, frontendContractSpecSchema),
  serviceFrontendLock: ServiceFrontendLockSchema,
});

export const SelectedAggregateFrontendLockSchema = Schema.Struct({
  aggregateFrontendLock: AggregateFrontendLockSchema,
  frontendSpec: AggregateFrontendControllerSpecSchema,
});

export const SelectedServiceFrontendLockSchema = Schema.Struct({
  serviceFrontendLock: ServiceFrontendLockSchema,
  frontendSpec: ServiceFrontendControllerSpecSchema,
});
