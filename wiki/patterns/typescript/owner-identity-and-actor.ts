import { RoutePattern } from '@remix-run/route-pattern';
import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/make/makeAggregateVersion';
import { defineAggregateActor } from '@zerospin/core/aggregateActor/defineAggregateActor';
import { makeAggregateActorVersion } from '@zerospin/core/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion';
import { makeActorIdentity } from '@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity';
import { makeActorDbVersion } from '@zerospin/core/models/make/makeActorDbVersion';
import { Effect, Schema } from 'effect';

/**
 * Named actor versions own aggregate identity, definition authorization,
 * model filters, and capability adapters.
 * Aggregate versions own models, contracts, and shared/internal adapters.
 * Services retain their existing identity declarations.
 *
 * Contracts consume domain capability interfaces. Actor adapters interpret
 * private identities, including different providers, accounts, and claim shapes.
 * The actor that owns the contract is the authorization. A capability that only
 * checks that its installing actor is present is not a seam.
 * Refusing adapters return declared failures; missing wiring is a configuration defect.
 * Guards may suspend without an execution DB. Programs and their capabilities
 * are synchronous. Guards receive the invocation database as `db`.
 * Claims include partition-identifying fields and additional authenticated fields.
 * makeActorIdentity({ claims, actorPath }) derives identitySchema from actorPath
 * and retains the complete claimsSchema. Contracts declare reusable claims schemas.
 * Guards and programs receive decoded claims as an argument. Service commands pass null claims.
 *
 * Sessions bind actorName/version and declare their claims schema.
 * Browser/session layers supply browser adapters without importing server actors.
 * A model schema may support program mutations without exposing any server rows;
 * only entries in actor.selections participate in projection.
 *
 * Commands retain exact actor name/version and encoded claims. Resolve that
 * definition across supported aggregate versions, including on replay; never use latest.
 * Internal commands have null authenticated provenance and explicit internal adapters.
 * Replica identity includes actor name/version before the canonical path.
 * @bad Merge all identities into one role union or inject unrelated identity tags with null.
 * @bad Capture an invocation's database or claims in a shared long-lived adapter.
 * @bad Treat an omitted model filter as unrestricted visibility.
 * @bad Import authenticate callbacks into browser bundles.
 */
const identity = makeActorIdentity({
  claims: Schema.Struct({ aggregateId: Schema.String, subject: Schema.String }),
  actorPath: RoutePattern.parse('/:subject'),
});
const db = makeActorDbVersion({ models: {} });
export const shopperActorV1 = makeAggregateActorVersion(
  defineAggregateActor({ name: 'shopper' }),
  {
    version: '1.0.0',
    db,
    claims,
    authentication: {
      credentialsSchema: Schema.Struct({ subject: Schema.String }),
      authenticate: ({ credentials }) =>
        Effect.succeed({
          aggregateId: 'acct_example',
          subject: credentials.subject,
        }),
    },
    contracts: {},
    queries: {},
  },
);
export const shopper = makeAggregateVersion(
  defineAggregate({ name: 'shopper' }),
  {
    version: '1.0.0',
    models: {},
    actors: { shopper: shopperActorV1 },
  },
);
