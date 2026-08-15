import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';

import { ProjectedItem, updateProjectedItemQuantity } from './projectionDomain';

export const projection = makeFrontendController({
  contracts: { updateSourceItemQuantity: updateProjectedItemQuantity },
  aggregateName: 'aggregate',
  frontendName: 'projection',
  systemName: 'frontendAdapters',
  models: { projectedItem: ProjectedItem },
});
