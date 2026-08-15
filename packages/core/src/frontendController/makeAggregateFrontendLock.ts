import { mapParseError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { IAggregateFrontendController } from './types.ts';

export const AggregateFrontendLockSchema = Schema.Struct({
  systemName: Schema.String,
  frontendName: Schema.String,
  models: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      modelName: Schema.String,
      abbreviation: Schema.String,
      version: Schema.String,
      propertiesJsonSchema: Schema.Unknown,
      indexes: Schema.Array(
        Schema.Struct({
          name: Schema.String,
          columns: Schema.Array(Schema.String),
          unique: Schema.Boolean,
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
    }),
  }),
});

export const makeAggregateFrontendLock = Effect.fn('makeAggregateFrontendLock')(
  function* (props: {
    frontend: IAggregateFrontendController;
  }): Effect.fn.Return<
    Schema.Schema.Type<typeof AggregateFrontendLockSchema>,
    IAnyError
  > {
    const { frontend } = props;
    const models: Record<
      string,
      {
        modelName: string;
        abbreviation: string;
        version: string;
        propertiesJsonSchema: unknown;
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
        payloadJsonSchema: unknown;
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

    return yield* Schema.validate(AggregateFrontendLockSchema)(
      {
        systemName: frontend.systemName,
        frontendName: frontend.frontendName,
        models,
        contracts,
      },
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'aggregate-frontend-lock-invalid',
        prefix: 'Failed to construct the aggregate frontend lock',
      }),
    );
  },
);
