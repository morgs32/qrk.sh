import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { PrimitiveKind } from '@zerospin/core/models/primitiveKind';
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

const encodedShapeSchema = Schema.Record({
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
  version: Schema.String,
  properties: encodedShapeSchema,
  indexes: Schema.Array(modelIndexSchema),
});

const frontendModelSpecSchema = Schema.extend(
  modelDefinitionSchema,
  Schema.Struct({
    historicalDefinitions: Schema.Array(
      Schema.extend(
        modelDefinitionSchema,
        Schema.Struct({ hasDirectAdapter: Schema.Boolean }),
      ),
    ),
  }),
);

const frontendContractSpecSchema = Schema.Struct({
  commandName: Schema.String,
  version: Schema.String,
  payloadJsonSchema: JsonSchema7RootSchema,
  historicalDefinitions: Schema.Array(
    Schema.Struct({
      commandName: Schema.String,
      version: Schema.String,
      payloadJsonSchema: JsonSchema7RootSchema,
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
  models: Schema.Record({
    key: Schema.String,
    value: frontendModelSpecSchema,
  }),
  contracts: Schema.Record({
    key: Schema.String,
    value: frontendContractSpecSchema,
  }),
  aggregateFrontendLock: AggregateFrontendLockSchema,
});

export const ServiceFrontendControllerSpecSchema = Schema.Struct({
  kind: Schema.Literal('service'),
  systemName: Schema.String,
  serviceName: Schema.String,
  frontendName: Schema.String,
  modelNames: Schema.Array(Schema.String),
  models: Schema.Record({
    key: Schema.String,
    value: frontendModelSpecSchema,
  }),
  contracts: Schema.Record({
    key: Schema.String,
    value: frontendContractSpecSchema,
  }),
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
