import { JSONSchema } from 'effect';
import { mapValues } from 'es-toolkit';

import { encodeShape } from '../models/encodeShape.ts';

import type { IServiceFrontendController } from './types.ts';

export function makeServiceFrontendControllerSpec<
  FRONTEND extends IServiceFrontendController,
>(frontendController: FRONTEND) {
  return {
    serviceName: frontendController.serviceName,
    actorName: frontendController.actorName,
    frontendName: frontendController.frontendName,
    version: frontendController.version,
    models: mapValues(frontendController.models, model => ({
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
    signatureJsonSchema: JSONSchema.make(frontendController.signature),
  };
}
