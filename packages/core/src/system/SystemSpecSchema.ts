import { Schema } from 'effect';

import { AggregateFrontendLockSchema } from '../frontendController/makeAggregateFrontendLock.ts';
import { ServiceFrontendLockSchema } from '../frontendController/makeServiceFrontendLock.ts';

const signatureVersionSchema = Schema.String.check(
  Schema.isPattern(
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-dev\.[0-9a-f]{12})?$/u,
  ),
);

const encodedShapeSchema = Schema.Record(
  Schema.String,
  Schema.Record(Schema.String, Schema.Unknown),
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
  historicalDefinitions: Schema.Array(
    Schema.Struct({
      modelName: Schema.String,
      abbreviation: Schema.String,
      version: Schema.String,
      hasDirectAdapter: Schema.Boolean,
      properties: encodedShapeSchema,
      indexes: Schema.Array(indexSchema),
    }),
  ),
});

const contractSchema = Schema.Struct({
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
      hasDirectAdapter: Schema.Boolean,
      payloadJsonSchema: Schema.Struct({
        dialect: Schema.Literal('draft-2020-12'),
        schema: Schema.Any,
        definitions: Schema.Record(Schema.String, Schema.Any),
      }),
    }),
  ),
});

const authenticationSignatureSchema = Schema.Struct({
  version: signatureVersionSchema,
  schemaJsonSchema: Schema.Struct({
    dialect: Schema.Literal('draft-2020-12'),
    schema: Schema.Any,
    definitions: Schema.Record(Schema.String, Schema.Any),
  }),
  historicalDefinitions: Schema.Array(
    Schema.Struct({
      version: signatureVersionSchema,
      schemaJsonSchema: Schema.Struct({
        dialect: Schema.Literal('draft-2020-12'),
        schema: Schema.Any,
        definitions: Schema.Record(Schema.String, Schema.Any),
      }),
      hasDirectAdapter: Schema.Boolean,
    }),
  ),
});

const mutationIdentitySchema = Schema.Struct({
  modelName: Schema.String,
  modelVersion: Schema.String,
  operationName: Schema.Literals([
    'create',
    'delete',
    'move',
    'replicateResource',
    'update',
  ]),
  jsonSchema: Schema.Struct({
    dialect: Schema.Literal('draft-2020-12'),
    schema: Schema.Any,
    definitions: Schema.Record(Schema.String, Schema.Any),
  }),
});

const mutationAdaptersSchema = Schema.Record(
  Schema.String,
  Schema.Record(
    Schema.String.check(
      Schema.isPattern(/^(create|delete|move|replicateResource|update)$/u),
    ),
    Schema.Array(
      Schema.Struct({
        source: mutationIdentitySchema,
        destination: Schema.NullOr(mutationIdentitySchema),
      }),
    ),
  ),
);

const frontendControllerSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('aggregate'),
    systemName: Schema.String,
    aggregateName: Schema.String,
    frontendName: Schema.String,
    modelNames: Schema.Array(Schema.String),
    models: Schema.Record(Schema.String, modelSchema),
    contracts: Schema.Record(Schema.String, contractSchema),
    aggregateFrontendLock: AggregateFrontendLockSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal('service'),
    systemName: Schema.String,
    serviceName: Schema.String,
    frontendName: Schema.String,
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
  version: Schema.String,
  authentication: Schema.Struct({
    signature: authenticationSignatureSchema,
  }),
  aggregates: Schema.Record(
    Schema.String,
    Schema.Struct({
      name: Schema.String,
      models: Schema.Record(Schema.String, modelSchema),
      contracts: Schema.Record(Schema.String, contractSchema),
      mutationAdapters: mutationAdaptersSchema,
      selections: Schema.Record(
        Schema.String,
        Schema.Struct({ modelName: Schema.String }),
      ),
      queries: Schema.Record(Schema.String, querySchema),
      frontends: Schema.Record(Schema.String, frontendBindingSchema),
    }),
  ),
  services: Schema.Record(
    Schema.String,
    Schema.Struct({
      name: Schema.String,
      models: Schema.Record(Schema.String, modelSchema),
      contracts: Schema.Record(Schema.String, contractSchema),
      mutationAdapters: mutationAdaptersSchema,
      queries: Schema.Record(Schema.String, querySchema),
      frontends: Schema.Record(Schema.String, frontendBindingSchema),
    }),
  ),
});
