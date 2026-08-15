import { mapValues } from 'es-toolkit';

import type { IContracts } from '../contracts/types.ts';
import type { IModels, InferCommandPayload } from '../models/types.ts';

import type { IGuard } from './makeGuard.ts';

export function makeGuards<
  CONTRACTS extends IContracts,
  USER_ID extends string,
  GUARDS extends Partial<{
    [K in keyof CONTRACTS & string]: ReadonlyArray<
      IGuard<USER_ID, IModels, InferCommandPayload<CONTRACTS[K]['payload']>>
    >;
  }>,
>(props: { contracts: CONTRACTS; guards?: GUARDS | undefined }) {
  const { contracts, guards: guardsInput = {} } = props;

  return mapValues(contracts, (_contract, key) => {
    const entry = guardsInput[key as keyof typeof guardsInput];
    return entry ?? [];
  });
}
