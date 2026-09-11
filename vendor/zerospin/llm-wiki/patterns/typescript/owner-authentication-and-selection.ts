import { RoutePattern } from '@remix-run/route-pattern';
import { makeAggregate } from '@zerospin/core/aggregate/makeAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/makeVersion';
import { Effect, Schema } from 'effect';

/**
 * Owner versions declare full authentication and the string subset naming a selection partition.
 * Authentication supplies aggregateId. Admission checks caller-selected owner/frontend fields.
 * Authorization, guards, and browser sessions retain full claims; selections receive only the subset.
 *
 * @bad Partition shared replicas by every guard claim, or retain full authentication as replica identity.
 * @bad Recover selection inputs from audit records instead of the owner pattern and selection schema.
 * @bad Derive application User resource IDs from an external subject without an application requirement.
 */
export const shopper = makeAggregateVersion(
  makeAggregate({ name: 'shopper' }),
  {
    version: '1.0.0',
    authentication: {
      signatureSchema: Schema.Struct({ subject: Schema.String }),
      authenticationSchema: Schema.Struct({
        aggregateId: Schema.String,
        subject: Schema.String,
        role: Schema.String,
      }),
      selectionSchema: Schema.Struct({ subject: Schema.String }),
      pattern: RoutePattern.parse('/:subject'),
      authenticate: ({ signature }) =>
        Effect.succeed({
          aggregateId: 'acct_example',
          subject: signature.subject,
          role: 'reader',
        }),
    },
    models: {},
    contracts: {},
    selections: {},
  },
);
