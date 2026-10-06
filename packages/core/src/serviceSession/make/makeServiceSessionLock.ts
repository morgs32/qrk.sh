import type { IEncodedShape } from '@zerospin/shapes';
import { Schema } from 'effect';

import { publicContracts } from '../../contracts/externalContract.ts';
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

  const contracts: Record<
    string,
    {
      commandName: string;
      version: string;
      payloadShape: Readonly<IEncodedShape>;
      failureJsonSchema: unknown;
      resultJsonSchema: unknown;
    }
  > = {};
  for (const [contractKey, contract] of Object.entries(
    publicContracts(definition.contracts),
  ).toSorted(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))) {
    contracts[contractKey] = {
      commandName: contract.commandName,
      version: contract.version,
      payloadShape: contract.spec.payloadShape,
      failureJsonSchema: structuredClone(contract.spec.failureJsonSchema),
      resultJsonSchema: structuredClone(contract.spec.resultJsonSchema),
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
