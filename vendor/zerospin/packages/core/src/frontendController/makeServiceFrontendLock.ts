import { mapParseError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { IServiceFrontendController } from './types.ts';

export const ServiceFrontendLockSchema = Schema.Struct({
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
});

export const makeServiceFrontendLock = Effect.fn('makeServiceFrontendLock')(
  function* (props: {
    frontend: IServiceFrontendController;
  }): Effect.fn.Return<
    Schema.Schema.Type<typeof ServiceFrontendLockSchema>,
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

    return yield* Schema.validate(ServiceFrontendLockSchema)(
      {
        systemName: frontend.systemName,
        frontendName: frontend.frontendName,
        models,
      },
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'service-frontend-lock-invalid',
        prefix: 'Failed to construct the service frontend lock',
      }),
    );
  },
);
