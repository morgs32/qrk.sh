import type { IAnyError } from '@zerospin/error';
import type { Effect, Schema } from 'effect';

import type { IAuthorizeFn } from '../authorize/makeAuthorize.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type { IAnyFrontendBinding } from '../frontendBinding/types.ts';
import type { ISelection } from '../models/makeSelection.ts';
import type { IAccountId, IActorId, IModel, IModels } from '../models/types.ts';

export type IActor = {
  accountId: IAccountId;
  actorId: IActorId;
};

export type IServiceQuery<
  NAME extends string = string,
  MODELS extends IModels = IModels,
  PARAMS_SCHEMA extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext,
  RESULT = unknown,
> = {
  kind: 'service';
  name: NAME;
  serviceName: string;
  paramsSchema: PARAMS_SCHEMA;
  query: (props: {
    db: IDb<IResourceDbConfig<MODELS>>;
    params: Schema.Schema.Type<PARAMS_SCHEMA>;
  }) => Effect.Effect<RESULT, IAnyError>;
};

export type IAnyServiceQuery = {
  kind: 'service';
  name: string;
  serviceName: string;
  paramsSchema: Schema.Schema.AnyNoContext;
  query: (props: never) => Effect.Effect<unknown, IAnyError>;
};

export type IActorQueries = Record<string, IServiceQuery>;

export type IActorApi<
  QUERIES extends Record<string, IAnyServiceQuery> = Record<
    string,
    IAnyServiceQuery
  >,
> = QUERIES;

/** Erased actor API stored on heterogeneous actor controllers. */
export type IAnyActorApi = Record<string, IAnyServiceQuery>;

export type IActorController<
  NAME extends string = string,
  MODELS extends IModels = IModels,
  SELECTIONS extends Record<string, ISelection<IModel>> = Record<
    string,
    ISelection<IModel>
  >,
  FRONTENDS extends Record<
    string,
    { name: string; models: IModels; contracts: Record<string, unknown> }
  > = Record<string, IAnyFrontendBinding>,
  ACTOR_API extends IAnyActorApi | {} = {},
  VERSION extends string = string,
> = {
  name: NAME;
  version: VERSION;
  models: MODELS;
  selections: SELECTIONS;
  frontends: FRONTENDS;
  authorize: IAuthorizeFn;
  api: ACTOR_API;
};

/** Erased actor stored on heterogeneous `IActorControllers` maps. */
export type IAnyActorController = {
  name: string;
  version: string;
  models: IModels;
  selections: Record<string, ISelection<IModel>>;
  frontends: Record<string, IAnyFrontendBinding>;
  authorize: IAuthorizeFn;
  api: IAnyActorApi;
};

/** Heterogeneous actor map on a system account. */
export type IActorControllers = Record<string, IAnyActorController>;
