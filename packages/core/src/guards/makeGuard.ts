import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

import type { IContract } from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type { IModels, InferCommandPayload } from '../models/types.ts';

export type IGuard<
  USER_ID extends string = string,
  MODELS extends IModels = IModels,
  PAYLOAD = unknown,
> = Readonly<{
  models: MODELS;
  program: {
    bivarianceHack(props: {
      userId: USER_ID;
      db: Readonly<
        Pick<IDb<IResourceDbConfig<MODELS, Record<never, never>>>, 'query'>
      >;
      payload: PAYLOAD;
    }): Effect.Effect<void, IAnyError>;
  }['bivarianceHack'];
}>;

export function makeGuard<
  CONTRACT extends IContract,
  MODELS extends IModels,
>(props: {
  contract: CONTRACT;
  models: MODELS;
  program: (props: {
    userId: string;
    payload: InferCommandPayload<CONTRACT['payload']>;
    db: Readonly<
      Pick<IDb<IResourceDbConfig<MODELS, Record<never, never>>>, 'query'>
    >;
  }) => Effect.Effect<void, IAnyError>;
}): IGuard<string, MODELS, InferCommandPayload<CONTRACT['payload']>> {
  return {
    models: props.models,
    program: props.program,
  };
}
