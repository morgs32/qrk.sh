import type { IIdentitySchema } from '@zerospin/core/identity/types';

import type { IPurchaseHostModels, IUserLookup } from './host.js';
import type { makePurchaseFrontendModule } from './makePurchaseFrontendModule.js';
export type IInternalOptions<
  HOST extends IPurchaseHostModels,
  IDENTITY extends IIdentitySchema,
  SELECTION extends IIdentitySchema,
> = {
  contractVersion?: string;
  frontend: ReturnType<typeof makePurchaseFrontendModule<HOST, IDENTITY>>;
  selectionIdentitySchema: SELECTION;
  resolveUserId: IUserLookup<HOST, SELECTION>;
};
