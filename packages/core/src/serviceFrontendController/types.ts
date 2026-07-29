import type { Schema } from 'effect';

import type { IModels } from '../models/types.ts';

export type IServiceFrontendController<
  SYSTEM_NAME extends string = string,
  SERVICE_NAME extends string = string,
  ACTOR_NAME extends string = string,
  FRONTEND_NAME extends string = string,
  MODELS extends IModels = IModels,
  SIGNATURE_SCHEMA extends Schema.Schema.AnyNoContext =
    Schema.Schema.AnyNoContext,
  VERSION extends string = string,
> = {
  systemName: SYSTEM_NAME;
  serviceName: SERVICE_NAME;
  actorName: ACTOR_NAME;
  frontendName: FRONTEND_NAME;
  version: VERSION;
  models: MODELS;
  modelNames: readonly string[];
  signature: SIGNATURE_SCHEMA;
};
