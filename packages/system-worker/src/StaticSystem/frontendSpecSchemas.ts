import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { encodedShapeSchema } from '@zerospin/schema';
import { Schema } from 'effect';

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

const frontendContractSpecSchema = Schema.Struct({
  commandName: Schema.String,
  version: Schema.String,
  payloadShape: encodedShapeSchema,
  models: Schema.Record(
    Schema.String,
    Schema.Struct({
      modelName: Schema.String,
      abbreviation: Schema.String,
      version: Schema.String,
      attributes: Schema.Array(Schema.String),
      attributesShape: encodedShapeSchema,
      propertiesShape: encodedShapeSchema,
      indexes: Schema.Array(
        Schema.Struct({
          name: Schema.String,
          columns: Schema.NonEmptyArray(Schema.String),
          unique: Schema.optionalKey(Schema.Boolean),
        }),
      ),
    }),
  ),
});

export const AggregateFrontendControllerSpecSchema = Schema.Struct({
  kind: Schema.Literal('aggregate'),
  systemName: Schema.String,
  aggregateName: Schema.String,
  aggregateVersion: Schema.String,
  name: Schema.String,
  modelNames: Schema.Array(Schema.String),
  models: Schema.Record(Schema.String, modelDefinitionSchema),
  contracts: Schema.Record(Schema.String, frontendContractSpecSchema),
  aggregateFrontendLock: AggregateFrontendLockSchema,
});

export const ServiceFrontendControllerSpecSchema = Schema.Struct({
  kind: Schema.Literal('service'),
  systemName: Schema.String,
  serviceName: Schema.String,
  serviceVersion: Schema.String,
  name: Schema.String,
  modelNames: Schema.Array(Schema.String),
  models: Schema.Record(Schema.String, modelDefinitionSchema),
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
