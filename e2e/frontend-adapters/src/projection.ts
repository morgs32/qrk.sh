import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { Schema } from 'effect';

import { SourceItem, updateSourceItemQuantity } from './domain';

export const projection = makeFrontendController({
  authenticationSchema: Schema.Struct({
    clerkUserId: Schema.String,
    aggregateId: Schema.String,
  }),
  aggregateVersion: '1.0.0',
  contracts: {
    updateSourceItemQuantity: { contract: updateSourceItemQuantity },
  },
  aggregateName: 'aggregate',
  name: 'projection',
  systemName: 'frontend-adapters',
  models: { sourceItem: SourceItem },
});
