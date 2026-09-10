import { aggregates } from '@zerospin/core/aggregate/index';
import { authentication } from '@zerospin/core/authentication/index';
import { makeSelection } from '@zerospin/core/models/makeSelection';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import { Effect, Schema } from 'effect';

import {
  createSourceItem,
  deleteSourceItem,
  SourceItem,
  updateSourceItemQuantity,
} from './domain';

export const authenticationSignature = {
  version: '1.0.0',
  signature: Schema.Struct({
    clerkUserId: Schema.String,
  }),
};

export const system = makeSystem({
  name: 'frontendAdapters',
  authentication: [
    authentication.makeVersion({
      version: authenticationSignature.version,
      signature: authenticationSignature.signature,
      authenticate: ({ signature }) => Effect.succeed(signature.clerkUserId),
    }),
  ],
  aggregates: {
    aggregate: [
      aggregates.makeVersion(aggregates.makeAggregate({ name: 'aggregate' }), {
        version: '1.0.0',
        authorize: () => Effect.void,
        models: { sourceItem: SourceItem },
        contracts: {
          createSourceItem: { contract: createSourceItem },
          updateSourceItemQuantity: { contract: updateSourceItemQuantity },
          deleteSourceItem: { contract: deleteSourceItem },
        },
        selections: {
          sourceItem: makeSelection({
            model: SourceItem,
            where: ({ userId }) => ({ userId }),
          }),
        },
      }),
    ],
  },
  services: {},
});
