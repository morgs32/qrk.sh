# Drizzle actor selections and authentication design

**Date:** 2026-09-22
**Status:** Archived on 2026-09-23; implemented or superseded, remaining verification deferred.

## Archive checkpoint — 2026-09-23

The Drizzle selection compiler, actor database authoring, shared handshake, and path-derived authentication identity are implemented. Historical focused verification is retained below. Remaining broader verification is recorded in [TODOS.md](../../../TODOS.md#specs-001002004--deferred-verification).

Archived under the maintainer’s verification-only closeout instruction. No tests or builds were rerun for this archival; historical passing or failing results are not claims about the current checkout.

## Problem Statement

Zerospin duplicates Drizzle's relational query compilation with a ZQL-derived authoring API, schema representation, and SQL compiler. Replace that pipeline while preserving complete-resource selection, replayable actor identity, transaction-local execution, and actor-version locks.

## Solution

```ts
const shopperHandshake = makeSessionHandshake({
  signatureSchema,
  AuthenticationSchema,
});
const shopperAuthentication = makeActorAuthentication({
  handshake: shopperHandshake,
  authenticate,
  actorPath: RoutePattern.parse('/:userId'),
});
const shopperDb = makeActorDbVersion({
  models: { user: userV1, cart: cartV1, cartItem: cartItemV1 },
});
const shopperActor = makeAggregateActorVersion(identity, {
  version: '1.0.0',
  db: shopperDb,
  authentication: shopperAuthentication,
  contracts,
  selections: {
    user: shopperDb.query.user.findMany({
      where: { id: { eq: shopperAuthentication.sql.placeholder('userId') } },
    }),
  },
});
```

## User Stories

1. Actor authors use Drizzle's typed relational queries over registered models.
2. Authentication authors declare shared signature and verified-claim schemas once.
3. Persistent identity derives from `actorPath`, without a duplicate authored `actorSchema`.
4. Session authors import a client-safe handshake without server authentication or database definitions.
5. SQL or binding changes fail version locks under an unchanged actor version.

## Implementation Decisions

1. `makeSessionHandshake({ signatureSchema, AuthenticationSchema })` owns the shared contract. Sessions infer signature inputs and check verified claims against session authentication requirements.
2. `makeActorAuthentication({ handshake, authenticate, actorPath })` owns server verification and persistent identity. Aggregate authentication retains its typed `executeCommand` capability. Command authorization remains on the actor.
3. Derive identity fields and their original codecs from parsed path parameters. Preserve path restrictions and require required decoded and encoded string fields. Claims outside the path remain available to commands without changing projection identity.
4. Authentication exposes `.sql.placeholder(name)` only for identity fields. Actor construction validates every embedded placeholder, including ordinary Drizzle placeholders. Native Drizzle `.execute()` does not acquire inferred authentication types.
5. `makeActorDbVersion({ models })` pins model versions and derives tables and relationships without opening storage. It has no independent version; actor versions lock model bindings.
6. Selections are constructed `findMany()` queries returning complete rows from their corresponding registered models. Reject partial columns, nested results, computed additions, and `findFirst()`. Relationship predicates remain supported. Model registration alone selects no rows.
7. Capture SQL, bindings, and row mapping during actor construction. Execute synchronously with decoded identity claims on the active resource transaction, without retaining a transaction or rereading mutable query configuration.
8. Locks store generated SQL, serializable literal/named-input descriptors, and model bindings. Encoders and row mapping remain runtime-only. SQL, literal, binding, and model-binding changes require an actor version bump; Drizzle upgrades may therefore require bumps.
9. Remove separate selection identities/versions and the ZQL package. Migrate aggregate/service actors, SDK exports, examples, tests, and current docs. Changed persisted schemas require empty storage. Add no compatibility paths and preserve unrelated work.

## Testing Decisions

1. Use selection-to-resource-graph integration tests for relationships, complete rows, codecs, different identities, and the active transaction.
2. Check model/relationship inference, identity placeholder names and values, handshake signatures, and incompatible result shapes.
3. Reject foreign database queries, non-identity/undeclared placeholders, and invalid path fields during construction.
4. Extend actor lock tests for changed SQL, literals, bindings, and model versions. Runtime identity values must not change declarations.
5. Verify command-only claim changes preserve actor identity while identity changes select another projection.
6. Exercise browser SQLite and Durable Object SQLite seams and browser handshake isolation.

## Out of Scope

1. Autonomous actor APIs and their identity rules; provisioner and operator use browser actors for now.
2. Partial-resource or nested-result synchronization.
3. Semantic SQL equivalence and identical locks across compiler upgrades.
4. A replacement query language or Drizzle wrapper that tracks placeholder requirements through query generic types.

## Further Notes

1. A read-only experiment established deferred binding and reuse of prepared SQL/row mapping on a separate connection. The implementation adapter centralizes the Drizzle compiler and mapper internals so upgrades can be verified at the existing resource-graph seams.

## Implementation Verification

1. Core: 396 tests passed, including relational resource graphs, mapped codecs, repeated identities, transaction rollback, immutable bindings, invalid query/path rejection, and actor updates.
2. Worker Node: 267 tests passed, including SQL, literal, identity-binding, and model-binding version locks. SDK: 7 tests passed, including browser export isolation. Shared-handshake session tests: 2 passed.
3. Durable Object SQLite: selected reconciliation and nested/outer transaction tests passed (5 tests).
4. Core, React, worker, and Shopping type checks and lint passed. Their dependency builds, the Shopping production build, and all 19 Shopping unit tests passed.
5. The broader React suite retains one pre-existing mock-session lifecycle failure: it expects local services to acquire before invalid authentication is rejected. The identical failure was reproduced using an isolated copy of the original HEAD source; this implementation leaves that unrelated lifecycle behavior and test unchanged.
6. Existing persisted data requires empty storage for the changed authored-spec schema. No storage was automatically cleared and no compatibility paths were added.
