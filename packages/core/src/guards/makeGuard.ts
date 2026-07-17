import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';

import type { IContract } from '../contracts/types.ts';
import type {
  IDb,
  IResourceDbConfig,
  ISyncSQLiteDatabase,
} from '../drizzle/types.ts';
import type {
  IModels,
  InferCommandPayload,
  InferIdFromAbbreviation,
} from '../models/types.ts';

export type IGuard = (props: {
  actorId: string;
  /* oxlint-disable typescript/no-explicit-any -- erased guard db */
  db: ISyncSQLiteDatabase<any, any>;
  /* oxlint-enable typescript/no-explicit-any */
  payload: unknown;
}) => Effect.Effect<void, IAnyError>;

export function makeGuard<
  CONTRACT extends IContract,
  MODELS extends IModels,
  ACTOR_MODEL_KEY extends keyof MODELS & string,
>(props: {
  contract: CONTRACT;
  models: MODELS;
  actor: ACTOR_MODEL_KEY;
  program: (props: {
    actorId: InferIdFromAbbreviation<MODELS[ACTOR_MODEL_KEY]['abbreviation']>;
    payload: InferCommandPayload<CONTRACT['payload']>;
    db: IDb<IResourceDbConfig<MODELS>>;
  }) => Effect.Effect<void, IAnyError>;
}): IGuard {
  const { program } = props;

  return ({ actorId, payload, db }) =>
    program({
      actorId: actorId as InferIdFromAbbreviation<
        MODELS[ACTOR_MODEL_KEY]['abbreviation']
      >,
      payload: payload as InferCommandPayload<CONTRACT['payload']>,
      db: db as IDb<IResourceDbConfig<MODELS>>,
    });
}
