import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';

import { SourceItem, updateSourceItemQuantity } from './domain';

export const projection = makeFrontendController({
  aggregateVersion: '1.0.0',
  contracts: {
    updateSourceItemQuantity: { contract: updateSourceItemQuantity },
  },
  aggregateName: 'aggregate',
  name: 'projection',
  systemName: 'frontendAdapters',
  models: { sourceItem: SourceItem },
});
