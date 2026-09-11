import { RoutePattern } from '@remix-run/route-pattern';
import { makeAggregate } from '@zerospin/core/aggregate/makeAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/makeVersion';
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
  name: 'frontend-adapters',
  aggregates: {
    aggregate: [
      makeAggregateVersion(makeAggregate({ name: 'aggregate' }), {
        authentication: {
          signatureSchema: Schema.Struct({
            clerkUserId: Schema.String,
            aggregateId: Schema.String,
          }),
          authenticationSchema: Schema.Struct({
            clerkUserId: Schema.String,
            aggregateId: Schema.String,
          }),
          selectionSchema: Schema.Struct({ clerkUserId: Schema.String }),
          pattern: RoutePattern.parse('/:clerkUserId'),
          authenticate: ({ signature }) => Effect.succeed(signature),
        },
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
            where: ({
              authentication,
            }: {
              authentication: { clerkUserId: string };
            }) => ({ userId: authentication.clerkUserId }),
          }),
        },
      }),
    ],
  },
  services: {},
});
