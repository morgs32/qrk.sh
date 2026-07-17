import { Schema } from 'effect';

const encodedShapeSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});

// The schema repeats each controller position just as SystemSpec repeats its
// definitions. Schema.Unknown is limited to encoded JSON Schema documents and
// encoded primitive descriptors; every surrounding identity and collection is
// validated explicitly.
export const SystemSpecSchema = Schema.Struct({
  systemName: Schema.String,
  version: Schema.String,
  accountControllers: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      name: Schema.String,
      version: Schema.String,
      models: Schema.Record({
        key: Schema.String,
        value: Schema.Struct({
          modelName: Schema.String,
          abbreviation: Schema.String,
          version: Schema.String,
          properties: encodedShapeSchema,
          indexes: Schema.Array(
            Schema.Struct({
              name: Schema.String,
              columns: Schema.Array(Schema.String),
              unique: Schema.optionalWith(Schema.Boolean, { exact: true }),
            }),
          ),
          historicalDefinitions: Schema.Array(
            Schema.Struct({
              modelName: Schema.String,
              abbreviation: Schema.String,
              version: Schema.String,
              properties: encodedShapeSchema,
              indexes: Schema.Array(
                Schema.Struct({
                  name: Schema.String,
                  columns: Schema.Array(Schema.String),
                  unique: Schema.optionalWith(Schema.Boolean, { exact: true }),
                }),
              ),
            }),
          ),
        }),
      }),
      contracts: Schema.Record({
        key: Schema.String,
        value: Schema.Struct({
          commandName: Schema.String,
          version: Schema.String,
          payloadJsonSchema: Schema.Unknown,
          mutationsJsonSchema: Schema.NullOr(Schema.Unknown),
        }),
      }),
      mutationAdapters: Schema.Record({
        key: Schema.String,
        value: Schema.Record({
          key: Schema.String.pipe(
            Schema.pattern(
              /^(create|delete|move|replicateResource|update)$/u,
            ),
          ),
          value: Schema.Array(
            Schema.Struct({
              source: Schema.Struct({
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
              }),
              destination: Schema.NullOr(
                Schema.Struct({
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
                }),
              ),
            }),
          ),
        }),
      }),
      actorControllers: Schema.Record({
        key: Schema.String,
        value: Schema.Struct({
          name: Schema.String,
          version: Schema.String,
          models: Schema.Record({
            key: Schema.String,
            value: Schema.Struct({
              modelName: Schema.String,
              abbreviation: Schema.String,
              version: Schema.String,
              properties: encodedShapeSchema,
              indexes: Schema.Array(
                Schema.Struct({
                  name: Schema.String,
                  columns: Schema.Array(Schema.String),
                  unique: Schema.optionalWith(Schema.Boolean, { exact: true }),
                }),
              ),
              historicalDefinitions: Schema.Array(
                Schema.Struct({
                  modelName: Schema.String,
                  abbreviation: Schema.String,
                  version: Schema.String,
                  properties: encodedShapeSchema,
                  indexes: Schema.Array(
                    Schema.Struct({
                      name: Schema.String,
                      columns: Schema.Array(Schema.String),
                      unique: Schema.optionalWith(Schema.Boolean, {
                        exact: true,
                      }),
                    }),
                  ),
                }),
              ),
            }),
          }),
          selections: Schema.Record({
            key: Schema.String,
            value: Schema.Struct({ modelName: Schema.String }),
          }),
          queries: Schema.Record({
            key: Schema.String,
            value: Schema.Struct({
              name: Schema.String,
              serviceName: Schema.String,
              paramsJsonSchema: Schema.Unknown,
            }),
          }),
          frontends: Schema.Record({
            key: Schema.String,
            value: Schema.Struct({
              name: Schema.String,
              frontendController: Schema.Struct({
                accountName: Schema.String,
                actorName: Schema.String,
                frontendName: Schema.String,
                version: Schema.String,
                models: Schema.Record({
                  key: Schema.String,
                  value: Schema.Struct({
                    modelName: Schema.String,
                    abbreviation: Schema.String,
                    version: Schema.String,
                    properties: encodedShapeSchema,
                    indexes: Schema.Array(
                      Schema.Struct({
                        name: Schema.String,
                        columns: Schema.Array(Schema.String),
                        unique: Schema.optionalWith(Schema.Boolean, {
                          exact: true,
                        }),
                      }),
                    ),
                    historicalDefinitions: Schema.Array(
                      Schema.Struct({
                        modelName: Schema.String,
                        abbreviation: Schema.String,
                        version: Schema.String,
                        properties: encodedShapeSchema,
                        indexes: Schema.Array(
                          Schema.Struct({
                            name: Schema.String,
                            columns: Schema.Array(Schema.String),
                            unique: Schema.optionalWith(Schema.Boolean, {
                              exact: true,
                            }),
                          }),
                        ),
                      }),
                    ),
                  }),
                }),
                contracts: Schema.Record({
                  key: Schema.String,
                  value: Schema.Struct({
                    commandName: Schema.String,
                    version: Schema.String,
                    payloadJsonSchema: Schema.Unknown,
                    mutationsJsonSchema: Schema.NullOr(Schema.Unknown),
                  }),
                }),
                signatureJsonSchema: Schema.Unknown,
              }),
            }),
          }),
        }),
      }),
    }),
  }),
  serviceControllers: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      name: Schema.String,
      version: Schema.String,
      models: Schema.Record({
        key: Schema.String,
        value: Schema.Struct({
          modelName: Schema.String,
          abbreviation: Schema.String,
          version: Schema.String,
          properties: encodedShapeSchema,
          indexes: Schema.Array(
            Schema.Struct({
              name: Schema.String,
              columns: Schema.Array(Schema.String),
              unique: Schema.optionalWith(Schema.Boolean, { exact: true }),
            }),
          ),
          historicalDefinitions: Schema.Array(
            Schema.Struct({
              modelName: Schema.String,
              abbreviation: Schema.String,
              version: Schema.String,
              properties: encodedShapeSchema,
              indexes: Schema.Array(
                Schema.Struct({
                  name: Schema.String,
                  columns: Schema.Array(Schema.String),
                  unique: Schema.optionalWith(Schema.Boolean, { exact: true }),
                }),
              ),
            }),
          ),
        }),
      }),
      contracts: Schema.Record({
        key: Schema.String,
        value: Schema.Struct({
          commandName: Schema.String,
          version: Schema.String,
          payloadJsonSchema: Schema.Unknown,
          mutationsJsonSchema: Schema.NullOr(Schema.Unknown),
        }),
      }),
      mutationAdapters: Schema.Record({
        key: Schema.String,
        value: Schema.Record({
          key: Schema.String.pipe(
            Schema.pattern(
              /^(create|delete|move|replicateResource|update)$/u,
            ),
          ),
          value: Schema.Array(
            Schema.Struct({
              source: Schema.Struct({
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
              }),
              destination: Schema.NullOr(
                Schema.Struct({
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
                }),
              ),
            }),
          ),
        }),
      }),
      queries: Schema.Record({
        key: Schema.String,
        value: Schema.Struct({
          name: Schema.String,
          serviceName: Schema.String,
          paramsJsonSchema: Schema.Unknown,
        }),
      }),
    }),
  }),
});
