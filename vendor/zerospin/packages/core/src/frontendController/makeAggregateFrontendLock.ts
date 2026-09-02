import { Schema, type JsonSchema } from 'effect';

import type { IAggregateFrontendController } from './types.ts';

export const AggregateFrontendLockSchema = Schema.Struct({
  systemName: Schema.String,
  frontendName: Schema.String,
  models: Schema.Record(
    Schema.String,
    Schema.Struct({
      modelName: Schema.String,
      abbreviation: Schema.String,
      version: Schema.String,
      propertiesJsonSchema: Schema.Struct({
        dialect: Schema.Literal('draft-2020-12'),
        schema: Schema.Any,
        definitions: Schema.Record(Schema.String, Schema.Any),
      }),
      indexes: Schema.Array(
        Schema.Struct({
          name: Schema.String,
          columns: Schema.Array(Schema.String),
          unique: Schema.Boolean,
        }),
      ),
    }),
  ),
  contracts: Schema.Record(
    Schema.String,
    Schema.Struct({
      commandName: Schema.String,
      version: Schema.String,
      payloadJsonSchema: Schema.Struct({
        dialect: Schema.Literal('draft-2020-12'),
        schema: Schema.Any,
        definitions: Schema.Record(Schema.String, Schema.Any),
      }),
    }),
  ),
});

export const makeAggregateFrontendLock = (props: {
  frontend: IAggregateFrontendController;
}): Schema.Schema.Type<typeof AggregateFrontendLockSchema> => {
  const frontend = props.frontend;
  const models: Record<
    string,
    {
      modelName: string;
      abbreviation: string;
      version: string;
      propertiesJsonSchema: JsonSchema.Document<'draft-2020-12'>;
      indexes: {
        name: string;
        columns: readonly string[];
        unique: boolean;
      }[];
    }
  > = {};
  for (const [modelKey, model] of Object.entries(frontend.models).toSorted(
    ([leftKey], [rightKey]) => leftKey.localeCompare(rightKey),
  )) {
    models[modelKey] = {
      modelName: model.modelName,
      abbreviation: model.abbreviation,
      version: model.version,
      propertiesJsonSchema: model.spec.propertiesJsonSchema,
      indexes: model.indexes
        .toSorted((left, right) => left.name.localeCompare(right.name))
        .map(index => ({
          name: index.name,
          columns: [...index.columns],
          unique: index.unique ?? false,
        })),
    };
  }

  const contracts: Record<
    string,
    {
      commandName: string;
      version: string;
      payloadJsonSchema: JsonSchema.Document<'draft-2020-12'>;
    }
  > = {};
  for (const [contractKey, contract] of Object.entries(
    frontend.contracts,
  ).toSorted(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))) {
    contracts[contractKey] = {
      commandName: contract.commandName,
      version: contract.version,
      payloadJsonSchema: contract.spec.payloadJsonSchema,
    };
  }

  return {
    systemName: frontend.systemName,
    frontendName: frontend.frontendName,
    models,
    contracts,
  };
};
