import { encodedShapeSchema } from '@zerospin/schema';
import { Schema } from 'effect';

import { AggregateFrontendLockSchema } from '../frontendController/makeAggregateFrontendLock.ts';
import { ServiceFrontendLockSchema } from '../frontendController/makeServiceFrontendLock.ts';

const authenticationVersionSchema = Schema.String.check(
  Schema.isPattern(
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-dev\.[0-9a-f]{12})?$/u,
  ),
);

const indexSchema = Schema.Struct({
  name: Schema.String,
  columns: Schema.Array(Schema.String),
  unique: Schema.optionalKey(Schema.Boolean),
});

const modelSchema = Schema.Struct({
  modelName: Schema.String,
  abbreviation: Schema.String,
  version: Schema.String,
  properties: encodedShapeSchema,
  indexes: Schema.Array(indexSchema),
});

const contractSchema = Schema.Struct({
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

const authenticationSchema = Schema.Struct({
  version: authenticationVersionSchema,
  signatureJsonSchema: Schema.Struct({
    dialect: Schema.Literal('draft-2020-12'),
    schema: Schema.Any,
    definitions: Schema.Record(Schema.String, Schema.Any),
  }),
});

const frontendControllerSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('aggregate'),
    systemName: Schema.String,
    aggregateName: Schema.String,
    aggregateVersion: Schema.String,
    name: Schema.String,
    modelNames: Schema.Array(Schema.String),
    models: Schema.Record(Schema.String, modelSchema),
    contracts: Schema.Record(Schema.String, contractSchema),
    aggregateFrontendLock: AggregateFrontendLockSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal('service'),
    systemName: Schema.String,
    serviceName: Schema.String,
    serviceVersion: Schema.String,
    name: Schema.String,
    modelNames: Schema.Array(Schema.String),
    models: Schema.Record(Schema.String, modelSchema),
    contracts: Schema.Record(Schema.String, contractSchema),
    serviceFrontendLock: ServiceFrontendLockSchema,
  }),
]);

const frontendBindingSchema = Schema.Struct({
  name: Schema.String,
  models: Schema.Record(
    Schema.String,
    Schema.Struct({
      modelName: Schema.String,
      hasProjectionAdapter: Schema.Boolean,
    }),
  ),
  contracts: Schema.Record(
    Schema.String,
    Schema.Struct({
      commandName: Schema.String,
      version: Schema.String,
      hasAuthoritativeAdapter: Schema.Boolean,
    }),
  ),
  controller: frontendControllerSchema,
});

const querySchema = Schema.Struct({
  name: Schema.String,
  serviceName: Schema.String,
  paramsJsonSchema: Schema.Struct({
    dialect: Schema.Literal('draft-2020-12'),
    schema: Schema.Any,
    definitions: Schema.Record(Schema.String, Schema.Any),
  }),
});

export const SystemSpecSchema = Schema.Struct({
  systemName: Schema.String,
  authentication: Schema.Array(authenticationSchema),
  aggregates: Schema.Record(
    Schema.String,
    Schema.Record(
      Schema.String,
      Schema.Struct({
        name: Schema.String,
        version: Schema.String,
        services: Schema.Record(Schema.String, Schema.String),
        models: Schema.Record(Schema.String, modelSchema),
        contracts: Schema.Record(Schema.String, contractSchema),
        selections: Schema.Record(
          Schema.String,
          Schema.Struct({ modelName: Schema.String }),
        ),
      }),
    ),
  ),
  services: Schema.Record(
    Schema.String,
    Schema.Record(
      Schema.String,
      Schema.Struct({
        name: Schema.String,
        version: Schema.String,
        historicalDefinitions: Schema.Array(
          Schema.Struct({
            version: Schema.String,
            models: Schema.Record(Schema.String, Schema.String),
            contracts: Schema.Record(Schema.String, Schema.String),
          }),
        ),
        models: Schema.Record(Schema.String, modelSchema),
        contracts: Schema.Record(Schema.String, contractSchema),
        queries: Schema.Record(Schema.String, querySchema),
        frontends: Schema.Record(Schema.String, frontendBindingSchema),
      }),
    ),
  ),
});
