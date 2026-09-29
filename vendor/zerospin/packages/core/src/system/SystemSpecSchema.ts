import { encodedShapeSchema } from '@zerospin/schema';
import { Schema } from 'effect';

import { SelectionQuerySchema } from '../models/SelectionQuerySchema.ts';

const identitySchema = Schema.Struct({
  claimsJsonSchema: Schema.Unknown,
  identityJsonSchema: Schema.Unknown,
  pattern: Schema.String,
});

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
  failureJsonSchema: Schema.Unknown,
  failureSchemas: Schema.Record(Schema.String, Schema.Unknown),
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
  aggregates: Schema.Record(
    Schema.String,
    Schema.Record(
      Schema.String,
      Schema.Struct({
        name: Schema.String,
        version: Schema.String,
        services: Schema.Record(Schema.String, Schema.String),
        models: Schema.Record(Schema.String, modelSchema),
        actors: Schema.Record(
          Schema.String,
          Schema.Struct({
            contracts: Schema.Record(Schema.String, contractSchema),
            name: Schema.String,
            version: Schema.String,
            authentication: Schema.Union([
              Schema.Literal('none'),
              Schema.Struct({ credentialsJsonSchema: Schema.Unknown }),
            ]),
            identity: identitySchema,
            models: Schema.Record(
              Schema.String,
              Schema.Struct({
                modelName: Schema.String,
                version: Schema.String,
              }),
            ),
            selections: Schema.Record(
              Schema.String,
              Schema.Struct({
                modelName: Schema.String,
                query: SelectionQuerySchema,
              }),
            ),
          }),
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
        actors: Schema.Record(
          Schema.String,
          Schema.Struct({
            name: Schema.String,
            version: Schema.String,
            authentication: Schema.Union([
              Schema.Literal('none'),
              Schema.Struct({ credentialsJsonSchema: Schema.Unknown }),
            ]),
            identity: identitySchema,
            models: Schema.Record(
              Schema.String,
              Schema.Struct({
                modelName: Schema.String,
                version: Schema.String,
              }),
            ),
            selections: Schema.Record(
              Schema.String,
              Schema.Struct({
                modelName: Schema.String,
                query: SelectionQuerySchema,
              }),
            ),
          }),
        ),
        models: Schema.Record(Schema.String, modelSchema),
        contracts: Schema.Record(Schema.String, contractSchema),
        queries: Schema.Record(Schema.String, querySchema),
      }),
    ),
  ),
  machines: Schema.Record(
    Schema.String,
    Schema.Struct({
      sourceKind: Schema.Literals(['aggregate', 'service']),
      sourceName: Schema.String,
      sourceVersion: Schema.String,
      selections: Schema.Record(
        Schema.String,
        Schema.Struct({
          modelName: Schema.String,
          query: SelectionQuerySchema,
        }),
      ),
      contracts: Schema.Record(
        Schema.String,
        Schema.Struct({
          targetKind: Schema.Literals(['aggregate', 'service']),
          targetName: Schema.String,
          targetVersion: Schema.String,
          contract: contractSchema,
        }),
      ),
      states: Schema.Record(Schema.String, Schema.Unknown),
      routes: Schema.Record(
        Schema.String,
        Schema.Struct({
          work: Schema.Literals(['idle', 'waiting', 'activation', 'command']),
          onCommand: Schema.Boolean,
        }),
      ),
    }),
  ),
});
