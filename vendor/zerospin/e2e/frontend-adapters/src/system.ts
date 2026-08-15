import { makeSignature } from '@zerospin/core/authentication/makeSignature';
import { makeContractAdapter } from '@zerospin/core/contracts/makeContractAdapter';
import type { IFrontendModelBindings } from '@zerospin/core/frontendBinding/types';
import { makeSelection } from '@zerospin/core/models/makeSelection';
import type { InferResource } from '@zerospin/core/models/types';
import { makeSystem } from '@zerospin/core/system/makeSystem';
import { Effect, Schema } from 'effect';

import {
  createSourceItem,
  deleteSourceItem,
  SourceItem,
  updateSourceItemQuantity,
} from './domain';
import { projection } from './projection';
import { ProjectedItem } from './projectionDomain';

export const authenticationSignature = makeSignature(
  {
    version: '1.0.0',
    schema: Schema.Struct({
      clerkUserId: Schema.String,
    }),
  },
  [],
);

export const system = makeSystem({
  name: 'frontendAdapters',
  version: '1.0.0',
  authentication: {
    signature: authenticationSignature,
    authenticate: ({ signature }) => Effect.succeed(signature.clerkUserId),
  },
  aggregates: {
    aggregate: {
      authorize: () => Effect.void,
      models: { sourceItem: SourceItem },
      contracts: {
        createSourceItem,
        updateSourceItemQuantity,
        deleteSourceItem,
      },
      selections: {
        sourceItem: makeSelection({
          model: SourceItem,
          where: ({ userId }) => ({ userId }),
        }),
      },
      frontends: {
        projection: {
          controller: projection,
          models: {
            projectedItem: 'sourceItem',
          } satisfies IFrontendModelBindings<
            typeof projection.models,
            { sourceItem: typeof SourceItem }
          >,
          projectionAdapters: {
            projectedItem: (resource: InferResource<typeof SourceItem>) =>
              Effect.succeed({
                id: resource.id,
                modelName: ProjectedItem.modelName,
                quantity: resource.quantity,
                version: ProjectedItem.version,
                createdAt: resource.createdAt,
                updatedAt: resource.updatedAt,
              }),
          },
          contractAdapters: {
            updateSourceItemQuantity: makeContractAdapter({
              contract: updateSourceItemQuantity,
              adapt: ({ payload }) =>
                Effect.succeed({ id: payload.id, quantity: payload.quantity }),
            }),
          },
        } satisfies Record<string, unknown>,
      },
    },
  },
  services: {},
});
