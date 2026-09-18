import { RoutePattern } from '@remix-run/route-pattern';
import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/makeAggregateVersion';
import { Effect, Schema } from 'effect';

/**
 * Aggregate and service versions declare signature, claims, and selection schemas plus authenticate() as siblings.
 * Authentication supplies aggregateId. Access binds verified identity; authorize checks the requested frontend.
 * Authorization, guards, and browser sessions retain full claims; selections receive only the subset.
 * Omit authentication fields to install caller-selected `{ aggregateId }` with pattern `/:aggregateId`;
 * the Gateway authenticate pipeline still runs — the client supplies aggregateId in the signature.
 * makeAggregateVersion remains server-only; omitting auth does not make the version factory browser-safe.
 *
 * Gateway aggregate() and service() return distinct authentication capabilities.
 * authenticate() returns private access; authorize() returns the corresponding frontend API.
 * Service authenticate receives only signature; aggregate authenticate also receives executeCommand.
 * @bad Overload one operation with aggregate/service union props.
 * App.makeAggregateFrontend and App.makeServiceFrontend select exact subsets from typeof system.
 * Browser declarations contain only authenticationSchema. Encode claims for hashes, backups and
 * command provenance; decode them for application callbacks, session state and UI.
 * Service delivery filters each admitted lock, including locks sharing a frontend name.
 * @bad Nest authenticate inside an authentication descriptor object.
 * @bad Partition shared replicas by every guard claim, or retain full authentication as replica identity.
 * @bad Recover selection inputs from audit records instead of the aggregate or service pattern and selection schema.
 * @bad Derive application User resource IDs from an external subject without an application requirement.
 * @bad Treat omitted aggregate authentication as an absent Gateway authenticate step.
 */
export const shopper = makeAggregateVersion(
  defineAggregate({ name: 'shopper' }),
  {
    version: '1.0.0',
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
    models: {},
    contracts: {},
    selections: {},
  },
);

/** Caller-selected aggregate identity when authentication is omitted. */
export const open = makeAggregateVersion(defineAggregate({ name: 'open' }), {
  version: '1.0.0',
  models: {},
  contracts: {},
  selections: {},
});
