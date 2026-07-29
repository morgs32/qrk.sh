import type { IAnyError } from '@zerospin/error';
import type { Effect, Schema } from 'effect';

import type { IContracts } from '../contracts/types.ts';
import type {
  IDb,
  IResourceDbConfig,
  ISyncSQLiteDatabase,
} from '../drizzle/types.ts';
import type { IFrontendController } from '../frontendController/types.ts';
import type { IActorId, IModels } from '../models/types.ts';

export type IAuthorizeFn = (props: {
  actorId: string;
  /* oxlint-disable typescript/no-explicit-any -- erased authorize db */
  db: ISyncSQLiteDatabase<any, any>;
  /* oxlint-enable typescript/no-explicit-any */
}) => Effect.Effect<void, IAnyError>;

export function makeAuthorize<
  SYSTEM_NAME extends string,
  ACTOR_NAME extends string,
  CONTRACTS extends IContracts,
  MODELS extends IModels = {},
  SIGNATURE_SCHEMA extends Schema.Schema.AnyNoContext =
    Schema.Schema.AnyNoContext,
>(props: {
  frontendController: IFrontendController<
    SYSTEM_NAME,
    ACTOR_NAME,
    CONTRACTS,
    MODELS,
    SIGNATURE_SCHEMA
  >;
  authorize: (props: {
    actorId: IActorId;
    db: IDb<IResourceDbConfig<MODELS>>;
  }) => Effect.Effect<void, IAnyError>;
}): IAuthorizeFn {
  return props.authorize as IAuthorizeFn;
}
