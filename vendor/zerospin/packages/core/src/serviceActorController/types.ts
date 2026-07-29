import type { IAnyError } from '@zerospin/error';
import type { Effect, Schema } from 'effect';

import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type { IActorId, IModels } from '../models/types.ts';
import type { IServiceFrontendController } from '../serviceFrontendController/types.ts';

export type IServiceFrontendBinding<
  NAME extends string = string,
  ACTOR_MODELS extends IModels = IModels,
  FRONTEND extends IServiceFrontendController = IServiceFrontendController,
  AUTH_CONTEXT = never,
> = {
  name: NAME;
  frontendController: FRONTEND;
  models: FRONTEND['models'];
  authenticate: (props: {
    signature: Schema.Schema.Type<FRONTEND['signature']>;
    db: Readonly<Pick<IDb<IResourceDbConfig<ACTOR_MODELS>>, 'query'>>;
  }) => Effect.Effect<IActorId, IAnyError, AUTH_CONTEXT>;
};

export type IServiceActorController<
  NAME extends string = string,
  MODELS extends IModels = IModels,
  FRONTENDS extends Record<
    string,
    {
      name: string;
      frontendController: IServiceFrontendController;
      models: IModels;
      authenticate: unknown;
    }
  > = Record<
    string,
    {
      name: string;
      frontendController: IServiceFrontendController;
      models: IModels;
      authenticate: unknown;
    }
  >,
  VERSION extends string = string,
> = {
  name: NAME;
  version: VERSION;
  models: MODELS;
  frontends: FRONTENDS;
};
