import type { IContracts } from '../contracts/types.ts';
import type { IModels, InferCommandPayload } from '../models/types.ts';

import type { IGuard } from './makeGuard.ts';

export type IGuards<
  CONTRACTS extends IContracts = IContracts,
  USER_ID extends string = string,
  MODELS extends IModels = IModels,
> = {
  [K in keyof CONTRACTS & string]: ReadonlyArray<
    IGuard<USER_ID, MODELS, InferCommandPayload<CONTRACTS[K]['payload']>>
  >;
};
