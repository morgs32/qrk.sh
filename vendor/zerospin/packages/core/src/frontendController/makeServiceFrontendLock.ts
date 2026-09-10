import { encodedShapeSchema, type IEncodedShape } from '@zerospin/schema';
import { Schema } from 'effect';

import type { IServiceFrontendController } from './types.ts';

export const ServiceFrontendLockSchema = Schema.Struct({
  systemName: Schema.String,
  frontendName: Schema.String,
  models: Schema.Record(
    Schema.String,
    Schema.Struct({
      modelName: Schema.String,
      abbreviation: Schema.String,
      version: Schema.String,
      propertiesShape: encodedShapeSchema,
      indexes: Schema.Array(
        Schema.Struct({
          name: Schema.String,
          columns: Schema.Array(Schema.String),
          unique: Schema.Boolean,
        }),
      ),
    }),
  ),
});

export const makeServiceFrontendLock = (props: {
  frontend: IServiceFrontendController;
}): Schema.Schema.Type<typeof ServiceFrontendLockSchema> => {
  const { frontend } = props;
  const models: Record<
    string,
    {
      modelName: string;
      abbreviation: string;
      version: string;
      propertiesShape: Readonly<IEncodedShape>;
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
      propertiesShape: model.spec.propertiesShape,
      indexes: model.indexes
        .toSorted((left, right) => left.name.localeCompare(right.name))
        .map(index => ({
          name: index.name,
          columns: [...index.columns],
          unique: index.unique ?? false,
        })),
    };
  }

  return {
    systemName: frontend.systemName,
    frontendName: frontend.name,
    models,
  };
};
