import * as sdk from '@zerospin/sdk';

import { shopperV2 } from './aggregates/shopper/ShopperV2';
import { appV1 } from './services/app/AppV1';

export const system = sdk.makeSystem({
  name: 'shopping',
  aggregates: {
    shopper: [shopperV2],
  },
  services: {
    app: [appV1],
  },
});
