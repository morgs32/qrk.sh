import type { IEncodedShape } from '@zerospin/schema';
import { Schema } from 'effect';

import type { IAggregateSessionLock } from '../AggregateSessionLockSchema.ts';
import type { IAggregateSessionDefinition } from '../types.ts';

export const makeAggregateSessionLock = (
  definition: Omit<IAggregateSessionDefinition, 'systemName'>,
): IAggregateSessionLock => {
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

  const contracts: Record<
    string,
    {
      commandName: string;
      version: string;
      payloadShape: Readonly<IEncodedShape>;
      failureJsonSchema: unknown;
    }
  > = {};
  for (const [contractKey, binding] of Object.entries(
    definition.contracts,
  ).toSorted(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))) {
    const { contract } = binding;
    contracts[contractKey] = {
      commandName: contract.commandName,
      version: contract.version,
      payloadShape: contract.spec.payloadShape,
      failureJsonSchema: structuredClone(contract.spec.failureJsonSchema),
    };
  }

  return {
    sessionName: definition.sessionName,
    actorName: definition.actorName,
    actorVersion: definition.actorVersion,
    claims: {
      claimsJsonSchema: Schema.toJsonSchemaDocument(definition.claimsSchema),
    },
    models,
    contracts,
  };
};
