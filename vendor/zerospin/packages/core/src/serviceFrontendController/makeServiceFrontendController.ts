import type { Schema } from 'effect';

import { assertValidModels } from '../models/assertValidModels.ts';
import type {
  IAssertValidModels,
  IModels,
  IServiceModel,
} from '../models/types.ts';

import type { IServiceFrontendController } from './types.ts';

export function makeServiceFrontendController<
  SYSTEM_NAME extends string,
  SERVICE_NAME extends string,
  ACTOR_NAME extends string,
  FRONTEND_NAME extends string,
  MODELS extends IModels,
  SIGNATURE_SCHEMA extends Schema.Schema.AnyNoContext,
  VERSION extends string,
>(props: {
  systemName: SYSTEM_NAME;
  serviceName: SERVICE_NAME;
  actorName: ACTOR_NAME;
  frontendName: FRONTEND_NAME;
  version: VERSION;
  models: MODELS &
    IAssertValidModels<MODELS> & {
      [K in keyof MODELS]: IServiceModel<MODELS[K], SERVICE_NAME>;
    };
  signature: SIGNATURE_SCHEMA;
}): IServiceFrontendController<
  SYSTEM_NAME,
  SERVICE_NAME,
  ACTOR_NAME,
  FRONTEND_NAME,
  MODELS,
  SIGNATURE_SCHEMA,
  VERSION
> {
  const {
    systemName,
    serviceName,
    actorName,
    frontendName,
    version,
    models,
    signature,
  } = props;

  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(
      'makeServiceFrontendController: version must be a non-empty string',
    );
  }

  assertValidModels({
    models,
    context: 'makeServiceFrontendController',
  });

  for (const [modelName, model] of Object.entries(models)) {
    if (!('serviceName' in model) || model.serviceName !== serviceName) {
      throw new Error(
        `makeServiceFrontendController: models.${modelName} must be created by makeServiceModel with serviceName "${serviceName}"`,
      );
    }
  }

  return {
    systemName,
    serviceName,
    actorName,
    frontendName,
    version,
    models,
    modelNames: Object.keys(models),
    signature,
  };
}
