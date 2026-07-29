import { JSONSchema, type Schema } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IContracts } from '../contracts/types.ts';
import type { IGuards } from '../guards/types.ts';
import { encodeShape } from '../models/encodeShape.ts';
import type { IModels } from '../models/types.ts';

import type { IFrontendControllerSpec } from './types.ts';

type IAnyFrontendController = {
  accountName: string;
  actorName: string;
  frontendName: string;
  version: string;
  contracts: IContracts;
  systemName: string;
  models: IModels;
  modelNames: readonly string[];
  guards: IGuards<IContracts>;
  signature: Schema.Schema.AnyNoContext;
};

export function makeFrontendControllerSpec(
  frontendController: IAnyFrontendController,
): IFrontendControllerSpec {
  return {
    accountName: frontendController.accountName,
    actorName: frontendController.actorName,
    frontendName: frontendController.frontendName,
    name: frontendController.actorName,
    version: frontendController.version,
    modelNames: frontendController.modelNames,
    models: mapValues(frontendController.models ?? {}, model => ({
      modelName: model.modelName,
      abbreviation: model.abbreviation,
      version: model.version,
      properties: encodeShape(model.propertiesShape),
      indexes: model.indexes,
      historicalDefinitions: model.historicalDefinitions
        .toSorted((left, right) => left.version.localeCompare(right.version))
        .map(definition => ({
          modelName: definition.modelName,
          abbreviation: definition.abbreviation,
          version: definition.version,
          properties: encodeShape({
            ...model.metadata,
            ...definition.attributes,
          }),
          indexes: definition.indexes,
        })),
    })),
    contracts: mapValues(
      frontendController.contracts,
      contract => contract.spec,
    ),
    signatureJsonSchema: JSONSchema.make(frontendController.signature),
  };
}
