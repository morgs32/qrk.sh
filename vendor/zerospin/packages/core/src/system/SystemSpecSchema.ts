import { Schema } from 'effect';

import { AggregateFrontendLockSchema } from '../frontendController/makeAggregateFrontendLock.ts';
import { ServiceFrontendLockSchema } from '../frontendController/makeServiceFrontendLock.ts';

const signatureVersionSchema = Schema.String.pipe(
  Schema.pattern(
    /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-dev\.[0-9a-f]{12})?$/u,
  ),
);

const encodedShapeSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});

const indexSchema = Schema.Struct({
  name: Schema.String,
  columns: Schema.Array(Schema.String),
  unique: Schema.optionalWith(Schema.Boolean, { exact: true }),
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
  payloadJsonSchema: Schema.Unknown,
  historicalDefinitions: Schema.Array(
    Schema.Struct({
      commandName: Schema.String,
      version: Schema.String,
      hasDirectAdapter: Schema.Boolean,
      payloadJsonSchema: Schema.Unknown,
    }),
  ),
});

const authenticationSignatureSchema = Schema.Struct({
  version: signatureVersionSchema,
  schemaJsonSchema: Schema.Unknown,
  historicalDefinitions: Schema.Array(
    Schema.Struct({
      version: signatureVersionSchema,
      schemaJsonSchema: Schema.Unknown,
      hasDirectAdapter: Schema.Boolean,
    }),
  ),
});

const mutationIdentitySchema = Schema.Struct({
  modelName: Schema.String,
  modelVersion: Schema.String,
  operationName: Schema.Literal(
    'create',
    'delete',
    'move',
    'replicateResource',
    'update',
  ),
  jsonSchema: Schema.Unknown,
});

const mutationAdaptersSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Record({
    key: Schema.String.pipe(
      Schema.pattern(/^(create|delete|move|replicateResource|update)$/u),
    ),
    value: Schema.Array(
      Schema.Struct({
        source: mutationIdentitySchema,
        destination: Schema.NullOr(mutationIdentitySchema),
      }),
    ),
  }),
});

const frontendControllerSchema = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal('aggregate'),
    systemName: Schema.String,
    aggregateName: Schema.String,
    frontendName: Schema.String,
    modelNames: Schema.Array(Schema.String),
    models: Schema.Record({ key: Schema.String, value: modelSchema }),
    contracts: Schema.Record({ key: Schema.String, value: contractSchema }),
    aggregateFrontendLock: AggregateFrontendLockSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal('service'),
    systemName: Schema.String,
    serviceName: Schema.String,
    frontendName: Schema.String,
    modelNames: Schema.Array(Schema.String),
    models: Schema.Record({ key: Schema.String, value: modelSchema }),
    contracts: Schema.Record({ key: Schema.String, value: contractSchema }),
    serviceFrontendLock: ServiceFrontendLockSchema,
  }),
);

const frontendBindingSchema = Schema.Struct({
  name: Schema.String,
  models: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      modelName: Schema.String,
      hasProjectionAdapter: Schema.Boolean,
    }),
  }),
  contracts: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      commandName: Schema.String,
      version: Schema.String,
      hasAuthoritativeAdapter: Schema.Boolean,
    }),
  }),
  controller: frontendControllerSchema,
});

const querySchema = Schema.Struct({
  name: Schema.String,
  serviceName: Schema.String,
  paramsJsonSchema: Schema.Unknown,
});

export const SystemSpecSchema = Schema.Struct({
  systemName: Schema.String,
  version: Schema.String,
  authentication: Schema.Struct({
    signature: authenticationSignatureSchema,
  }),
  aggregates: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      name: Schema.String,
      models: Schema.Record({ key: Schema.String, value: modelSchema }),
      contracts: Schema.Record({ key: Schema.String, value: contractSchema }),
      mutationAdapters: mutationAdaptersSchema,
      selections: Schema.Record({
        key: Schema.String,
        value: Schema.Struct({ modelName: Schema.String }),
      }),
      queries: Schema.Record({ key: Schema.String, value: querySchema }),
      frontends: Schema.Record({
        key: Schema.String,
        value: frontendBindingSchema,
      }),
    }),
  }),
  services: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      name: Schema.String,
      models: Schema.Record({ key: Schema.String, value: modelSchema }),
      contracts: Schema.Record({ key: Schema.String, value: contractSchema }),
      mutationAdapters: mutationAdaptersSchema,
      queries: Schema.Record({ key: Schema.String, value: querySchema }),
      frontends: Schema.Record({
        key: Schema.String,
        value: frontendBindingSchema,
      }),
    }),
  }),
});
