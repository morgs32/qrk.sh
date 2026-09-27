import type { IClaimsSchema } from '@zerospin/core/identity/types';

import type { IPurchaseHostModels, IUserLookup } from './host.js';
import type { makePurchaseFrontendModule } from './makePurchaseFrontendModule.js';
export type IInternalOptions<
  HOST extends IPurchaseHostModels,
  CLAIMS extends IClaimsSchema,
  SELECTION extends IClaimsSchema,
> = {
  contractVersion?: string;
  frontend: ReturnType<typeof makePurchaseFrontendModule<HOST, CLAIMS>>;
  selectionIdentitySchema: SELECTION;
  resolveUserId: IUserLookup<HOST, SELECTION>;
};
