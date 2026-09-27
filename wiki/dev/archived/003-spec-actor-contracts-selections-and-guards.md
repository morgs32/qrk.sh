# Actor-owned contracts, versioned selections, and guard capabilities

**Date:** 2026-09-22
**Status:** Implemented and verified
**Implementation:** [Completed plan](003-plan-actor-contracts-selections-and-guards.md)

## Problem Statement

Aggregate versions currently register executable contracts independently of actor views. Internal aggregate commands can omit actor provenance, including commands issued during authentication. Selection queries separately declare parameters whose values already come from actor identity. Guards are server binding callbacks rather than portable contract behavior backed by typed capabilities.

This design makes actor versions the sole authored owners of aggregate contracts, gives selections and guard interfaces explicit identities and versions, and makes authentication a typed input to contract execution. It replaces the earlier proposal to retain an aggregate contract registry.

## Solution

1. Aggregates own canonical models, service pins, actor versions, shared implementation layers, and execution database registration. They do not author a `contracts` map.
2. Actor versions own selections, callable contract versions, authentication declarations, and default capability implementations. Every aggregate command identifies its actor name and version, including server-originated commands without browser sessions.
3. Selections declare typed authentication requirements and use those claims directly in query authoring. Their query inputs remain reproducible from the actor's projection identity.
4. Named guard versions declare payload and failure schemas. Contract guard callbacks invoke these capabilities; layers supply implementations. Aggregate implementations take precedence over actor implementations on the server.
5. A server-only `provisioner` actor creates users during trusted authentication flows. Its commands retain explicit claims and provenance without requiring a browser session.

## User Stories

1. As an application author, I can inspect an actor version to see its selected data and callable contracts without reconciling a second aggregate contract registry.
2. As an application author, I receive a composition error when an actor contract mutates a model absent from its selections or uses a different model version.
3. As a selection author, I declare required authentication claims once and reference them in the query without duplicating a query-parameter declaration.
4. As a contract author, I receive typed, validated authentication in both the program and guard callback.
5. As a guard author, I define a reusable versioned input/failure interface without coupling it to authentication providers or a specific implementation.
6. As a session author, I supply local guard implementations for optimistic execution. As an aggregate author, I override actor defaults for authoritative execution.
7. As an operator, I can attribute every aggregate command to an exact actor version, including provisioning commands and other trusted server work.
8. As a user, I cannot authenticate or submit browser commands as the provisioner merely by naming it.
9. As a maintainer, I can replay commands with their recorded actor provenance and the existing explicit contract-version adaptation rules, without searching unrelated actors for a matching command name.

## Implementation Decisions

### Actor ownership and command provenance

1. Actor versions register contracts directly as `contracts: { addToCart: addToCartV1 }`. Keys must match the registered contract names. Remove the aggregate-authored contract map rather than retaining a compatibility registry.
2. Contract resolution follows the aggregate and actor version context, then that actor's contract map. Admission validates the submitted actor and contract version. Materialization retains existing explicit version adaptation while resolving within the recorded actor lineage; it never borrows another actor's contract or silently substitutes the latest actor.
3. Every contract mutation model must be selected by its actor using the exact model version. Additional read-only selections are allowed. Compare underlying model identities, not arbitrary aliases in a contract's model map. Selected models must also match the canonical models of the containing aggregate version.
4. Aggregate command envelopes require actor name/version independently of `sessionId`. Server-originated commands may have null session, frontend, and push metadata. A null session no longer means an absent actor or skipped actor resolution.
5. Browser admission validates the command against its authenticated actor. Trusted server entrypoints establish server actor provenance; accepting an actor name from an untrusted request does not authorize execution as that actor.
6. Preserve original command provenance through retained history, retries, materialization, and existing delivery paths. Service-derived materialization entries remain a distinct entry kind; they are not fabricated aggregate commands and do not acquire provisioner provenance.
7. Update direct command construction, authentication-time execution, frontend registration, system specification generation, and relevant contract lookups to use actor-owned registrations. Derived internal lookup structures are implementation details, not a second authored registry.

### Versioned selections and authentication

1. Add `defineSelection({ name })` and `makeSelectionVersion(selection, { version, model, authentication, query })`. A selection version pins one selected model, its query, and its required authentication schema. Actors reference these versions in their model-keyed selection maps.
2. The selection query callback receives `{ query, authentication }`. Authentication fields used in expressions are typed query references; concrete claims are bound when the query executes. Preserve declarative query capture and parameterized SQL rather than capturing a live session in the definition.
3. Remove separately authored `parameters` from selection query declarations. Derive the necessary query parameter metadata from authentication requirements. This does not remove parameters from the general-purpose query library.
4. Check that the actor can supply the selection's required authentication claims. Every referenced claim must be represented in the actor's projection identity, currently its `actorSchema` and canonical `actorPath`. Two callers sharing a projection identity must produce the same selected data.
5. Do not pass unrelated transient claims into shared projection evaluation. Projection rebuilds continue to reconstruct required selection inputs from retained identity without needing a live session or the last command's caller claims.
6. Selection versions are pinned by actor declarations. They do not introduce independently selected storage partitions or implicit selection migrations.

Illustrative selection authoring:

```ts
const shopperUsers = defineSelection({ name: 'shopperUsers' });

const shopperUsersV1 = makeSelectionVersion(shopperUsers, {
  version: '1.0.0',
  model: userV1,
  authentication: Schema.Struct({ clerkUserId: Schema.String }),
  query: ({ query, authentication }) =>
    query.user.where('clerkUserId', authentication.clerkUserId),
});
```

### Contract authentication and shared guard callbacks

1. Contract versions may declare an `authentication` schema. Infer both `guard` and `program` authentication arguments from that schema. Actors supplying a contract must produce compatible claims; additional actor claims are allowed.
2. Validate contract authentication once per execution attempt before either callback, and pass the same validated value to both. A schema requiring claims rejects null authentication before either callback runs. Without a schema, preserve the generic nullable authentication input.
3. Contract versions own the optional shared `guard: Effect.fn(function* ({ payload, authentication }) { ... })` callback. It explicitly maps command payload and authenticated claims into named guard payloads. Named guards receive no implicit authentication argument or ambient authentication binding from their own factory.
4. Run contract guards during optimistic execution, pending-command replay, and authoritative execution before applying mutations. Preserve synchronous execution and server transaction boundaries. Authentication validation precedes the program; the authoritative guard remains inside the mutation transaction and reuses the validated authentication.
5. Replace server binding callbacks with the shared contract callback rather than retaining two guard hooks. Preserve existing failure retention, mutation rollback, command ordering, and infrastructure retry behavior.

### Named guard services and layer precedence

1. Add `defineGuard({ name })` and `makeGuardVersion(guard, { version, payload, failure })`. Payload and failure are Effect schemas. Guard interfaces declare no models, program, or authentication schema.
2. `CanAddToCartV1.guard(payload)` returns an Effect requiring that exact versioned guard service. Validate inputs and declared business failures; framework failures retain their existing classification.
3. `CanAddToCartV1.make(implementation)` returns an Effect layer supplying the service. The implementation receives the decoded payload and returns an Effect with void success. Preserve implementation dependency requirements instead of erasing them.
4. Service identity includes guard name and version. Different versions may coexist without satisfying each other's requirements.
5. Effect requirements replace the earlier proposed guards map and null entries. Missing implementations must surface as composition/configuration failures, never silently disable checks.
6. On the server, aggregate-provided implementations override actor implementations of the same guard version. Actor layers supply guards absent from the aggregate layer. Make this precedence explicit and tested while preserving per-invocation database/authentication binding and scoped acquisition/release.
7. Browser execution uses its local layer. Do not import server implementations into browser bundles. Supply the layer through the existing frontend/session initialization path; the conversational `makeSession` example does not require a new session constructor or lifecycle redesign.
8. Guard implementations obtain model access through existing typed execution database services. Guard interface declarations do not independently prove selection completeness. The existing restrictions on local database visibility still apply.
9. A contract's failure schema must cover business failures escaping its guard callback, or the callback must explicitly map them. Persist failures using the executing contract's existing failure codec and provenance, not a separate guard-result history.

Illustrative guard authoring:

```ts
const canAddToCart = defineGuard({ name: 'canAddToCart' });
const CanAddToCartV1 = makeGuardVersion(canAddToCart, {
  version: '1.0.0',
  payload: Schema.Struct({
    cartId: Schema.String,
    clerkUserId: Schema.String,
  }),
  failure: CartDenied,
});

// Inside a contract with a typed authentication schema:
guard: Effect.fn(function* ({ payload, authentication }) {
  yield* CanAddToCartV1.guard({
    cartId: payload.cartId,
    clerkUserId: authentication.clerkUserId,
  });
});
```

### Server-only provisioner

1. Define the actor identity as `defineAggregateActor({ name: 'provisioner' })` and name its first version `provisionerV1`.
2. Server-only actors omit both `signatureSchema` and `authenticate`. They retain authentication schemas, actor identity/path declarations, selections, contracts, and layers. No separate `serverOnly` flag is introduced. Browser-facing actors must provide the signature schema and authentication entrypoint together.
3. Browser authentication and frontend binding reject server-only actors. Trusted server execution validates supplied claims without recursively invoking an authentication callback on the server-only actor.
4. Shopping's trusted authentication flow verifies the caller identity, then executes `createUserV1` through `provisionerV1` with authentication `{ aggregateId, clerkUserId }`. The command records provisioner name/version and those claims, with no browser session.
5. `createUserV1` declares that authentication schema. Its payload retains the new user ID and removes the duplicate `clerkUserId`; the program reads the Clerk identity from authentication. Require the authenticated aggregate ID to agree with the command target.
6. The provisioner selects `userV1`, filtered by authenticated `clerkUserId`. That field participates in its actor projection identity. This satisfies the rule that its mutation models appear in its selections without exposing all users.
7. After provisioning succeeds, the shopper authentication flow completes using the verified claims. Preserve existing handling of an already-provisioned user. The shopper actor does not expose the provisioning contract.

## Testing Decisions

1. Extend existing Core authoring/typecheck seams for selection definitions, actor composition, contract authentication, and execution-layer requirements. Reject mismatched model versions, unselected mutation models, incompatible claims, non-identity selection claims, wrong guard payloads/versions, and missing services.
2. Verify authentication is decoded once per execution attempt, both callbacks receive the typed value, extra actor claims are accepted, and invalid/null required authentication prevents callbacks.
3. Extend existing execution and owner-layer tests to prove aggregate guard precedence, actor fallback for other guards, local session implementations, per-invocation context isolation, and cleanup after success or failed acquisition.
4. Extend the existing session replay and authoritative execution seams: guard rejection applies no mutations, pending replay reruns checks, server guards remain transactional, and declared failures survive normal retention and reconciliation.
5. Exercise actor-specific admission and historical execution: reject absent actor contracts, retain exact actor provenance, and preserve explicit supported contract adaptation without cross-actor lookup.
6. Test Shopping provisioning end to end: browser impersonation is rejected, trusted provisioning succeeds without a session, identity comes from verified claims, duplicate-user handling remains correct, and the selected graph contains only the intended user.
7. Run affected Nx typecheck, lint, Node, and Workerd targets during implementation, including affected SDK and Shopping consumers. These checks have not been run for this design-only change.

## Out of Scope

1. Async admission preflight, remote guard execution, guard-verdict storage, or changes to materialization ordering and replication ownership.
2. Independent selection storage identities, full-authentication projection partitions, or removal of general-purpose query parameters.
3. Service-actor ownership redesign. Adapt service consumers of shared contract APIs as necessary without inventing aggregate provenance for service commands.
4. Compatibility aliases, duplicate authored contract registries, null-provenance aggregate command paths, fallback decoders, or translation migrations.
5. A new session constructor, implementation plan, issue tracker publication, or code implementation in this specification task.

## Further Notes

1. This spec supersedes the aggregate contract ownership and binding-guard authoring portions of [Spec 001](001-spec-command-guards-and-execution-services.md). Preserve its execution, replication, transaction, and ordering invariants unless explicitly changed above.
2. Preserve [Spec 002](002-spec-typed-business-failures-and-rpc-envelopes.md) failure envelopes and versioned failure adaptation. Guard service interfaces do not replace retained contract failure identity.
3. During implementation, update affected architecture docs, glossary entries, SDK examples, and local patterns to the new ownership and execution rules. Existing documentation is not evidence that a proposed API is already implemented.
4. Apply the pre-release hard cutover. Changed fixed storage schemas require empty storage; do not reset user storage as part of writing this spec or implicitly during implementation.
