import { makeFrontendController } from '@zerospin/sdk/browser';

import { Product } from '../models/Product';

export const catalog = makeFrontendController({
  systemName: 'shopping',
  serviceName: 'app',
  frontendName: 'catalog',
  models: {
    product: Product,
  },
});
