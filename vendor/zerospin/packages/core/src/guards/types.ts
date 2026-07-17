import type { IContracts } from '../contracts/types.ts';

import type { IGuard } from './makeGuard.ts';

export type IGuards<CONTRACTS extends IContracts = IContracts> = {
  [K in keyof CONTRACTS & string]: ReadonlyArray<IGuard>;
};
