import type { IAnyError } from '@zerospin/error';
import type { Effect } from 'effect';
import { mapValues } from 'es-toolkit';

import type { IContracts } from '../contracts/types.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import type {
  IActorId,
  IModels,
  InferCommandPayload,
} from '../models/types.ts';

import type { IGuards } from './types.ts';

export function makeGuards<
  CONTRACTS extends IContracts,
  MODELS extends IModels,
>(props: {
  contracts: CONTRACTS;
  guards?:
    | {
        [K in keyof CONTRACTS & string]?: ReadonlyArray<
          (props: {
            actorId: IActorId;
            db: IDb<IResourceDbConfig<MODELS>>;
            payload: InferCommandPayload<CONTRACTS[K]['payload']>;
          }) => Effect.Effect<void, IAnyError>
        >;
      }
    | Partial<IGuards<CONTRACTS>>;
}): IGuards<CONTRACTS> {
  const { contracts, guards: guardsInput = {} } = props;

  return mapValues(contracts, (_contract, key) => {
    const entry = guardsInput[key as keyof typeof guardsInput];
    return entry ?? [];
  }) as IGuards<CONTRACTS>;
}
