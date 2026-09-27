import type { IEncodedShape } from '@zerospin/schema';
import { Schema } from 'effect';

import type { IServiceSessionLock } from '../ServiceSessionLockSchema.ts';
import type { IServiceSessionDefinition } from '../types.ts';

export const makeServiceSessionLock = (
  definition: Omit<IServiceSessionDefinition, 'systemName'>,
): IServiceSessionLock => {
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
  for (const [modelKey, model] of Object.entries(definition.models).toSorted(
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
    sessionName: definition.sessionName,
    actorName: definition.actorName,
    actorVersion: definition.actorVersion,
    identity: {
      identityJsonSchema: Schema.toJsonSchemaDocument(
        definition.identity.identitySchema,
      ),
    },
    models,
  };
};
