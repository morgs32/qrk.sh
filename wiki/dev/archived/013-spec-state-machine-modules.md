# State-machine modules

> Historical: superseded by [Plan 013](../archived/013-plan-state-machine-modules.md). Domain factories return plain model, contract, and automation bundles; AAVR and SAVR own automation execution.

**Date:** 2026-09-26
**Status:** Implemented

This records the earlier experimental implementation. The subsequent design is
captured in [Plan 013: Domain modules and automations](../plans/013-plan-state-machine-modules.md).

## Problem Statement

State machines currently refer to models and contracts assembled elsewhere.
Attaching a machine requires separately registering its state model on the
aggregate. Supporting models remain outside the machine's ownership boundary.

Applications need an encapsulated module that constructs its own models,
contracts, lifecycle behavior, and read views. An aggregate should be able to
attach several such modules without repeating their declarations. Other
aggregate code should change module data through the module's exported contracts.

## Solution

1. Extend the state-machine declaration into a module containing its owned models
   and contracts, designated state model, routes, activations, and named views.
2. Keep module construction under an ordinary domain-specific factory. Each
   factory decides which customizations it accepts and produces a complete module
   before attachment.
3. Attach modules through the aggregate's existing `machines` property. Derive
   the aggregate's effective model inventory from directly authored models and
   attached modules.
4. Enforce module write ownership during authoritative command execution,
   covering the state model and every supporting model.
5. Preserve the aggregate's responsibility for storage, ordering, transactions,
   and activation execution.

```ts
const purchase = makePurchaseModule({
  // Customization defined by this particular factory.
});

const fulfillment = makeFulfillmentModule({
  // This factory may offer entirely different customization.
});

const shop = makeAggregateVersion(shopIdentity, {
  version: '1.0.0',
  models: { cart: cartV1 },
  machines: { purchase, fulfillment },
  actors: { shopper },
});
```

The purchase and fulfillment models are incorporated through their modules. The
aggregate's authored `models` lists its directly owned cart model.

## User Stories

1. As an application author, I can attach several state-machine modules to one
   aggregate.
2. As a module author, I can own a state model and related models, such as a
   purchase and its items.
3. As an application author, I can attach a module without repeating its models
   or contracts on the aggregate.
4. As a module author, I can provide a factory that accepts additional model
   fields, contract implementations, or other domain-specific customization.
5. As a contract author working inside that factory, I can combine state entry
   with additional model changes in one transaction.
6. As an actor author, I can expose selected module contracts and bind module
   views to the actor's identity.
7. As a module author, I can rely on unrelated contracts being unable to create,
   update, or delete any owned model.
8. As an application author, I can replace or remove a module in a new aggregate
   version without leaving its old declarations in the effective model inventory.

## Implementation Decisions

### Module declaration and factory

1. Retain `makeStateMachine` as the framework declaration factory and `machines`
   as the aggregate attachment property.
2. Add explicit owned `models` and `contracts` collections to the declaration.
   Retain one designated state `model`, its enum `stateKey`, creation contracts,
   state routes, activations, and views.
3. Require the designated state model to belong to the module's models. Creation,
   route, and activation-output contracts must reference the module's canonical
   contracts.
4. Treat contract model dependencies separately from ownership. Referencing a
   model in a contract does not make it module-owned.
5. Expose contracts and named views as the module's application interface.
   Framework access to model metadata for schemas, queries, and validation does
   not grant mutation authority.
6. Let each domain factory choose its own parameters and construct or replace
   declarations before calling `makeStateMachine`. Do not introduce a universal
   extension, inheritance, or override protocol.
7. Wire routes, views, and contract dependencies to the final customized
   declarations. Replacing a contract must not leave routes referring to its
   earlier implementation.

The declaration assembled inside a purchase factory could have this shape. The
referenced models, contracts, and view are the final values produced by that
factory.

```ts
return makeStateMachine({
  name: 'purchase',
  models: {
    purchase: purchaseV1,
    purchaseItem: purchaseItemV1,
  },
  contracts: {
    createPurchase: createPurchaseV1,
    submitPurchase: submitPurchaseV1,
  },
  model: purchaseV1,
  stateKey: 'state',
  create: {
    createPurchase: createPurchaseV1,
  },
  states: {
    open: {
      contracts: {
        submitPurchase: submitPurchaseV1,
      },
    },
    submitted: {
      contracts: {},
    },
  },
  views: {
    details: purchaseDetailsView,
  },
});
```

A customized `submitPurchaseV1` may update purchase fields, write purchase items,
and enter `submitted` in one command. Its factory defines how callers supply that
customization.

### Aggregate composition

1. The aggregate's authored `models` contains only directly owned models. Attached
   module models are incorporated automatically into the effective
   `aggregate.models` used by storage, validation, and system metadata.
2. Allow aggregates with no directly owned models; omitted `models` defaults to
   an empty collection.
3. Permit several modules with distinct names. Every owned model and contract has
   one module owner within an aggregate version.
4. Reject conflicting model registrations, including repeating a module-owned
   model in the aggregate's authored models or assigning it to another module.
   Do not resolve collisions through attachment order.
5. Keep actors independently registered. Actors select module contract exports to
   grant invocation access; selecting a contract does not redeclare it or
   transfer ownership.
6. Keep ordinary command resolution through the recorded actor lineage and
   activation output resolution through the attached machine. Do not introduce
   an aggregate-authored contracts registry.
7. Recompute effective declarations from authored inputs during aggregate
   upgrades. Replacing or removing a module must also replace or remove its
   contributions, and remaining actor/view references must validate against the
   resulting inventory.
8. Preserve model and contract versions. The module definition continues to be
   versioned with its aggregate.

For example, an actor's contract selection can reference the module's exports
directly:

```ts
contracts: {
  createPurchase: purchase.contracts.createPurchase,
  submitPurchase: purchase.contracts.submitPurchase,
}
```

The actor grants access to those contracts. Their definitions and write authority
remain with the purchase module.

### Encapsulation and execution

1. Before applying mutations, check every targeted module-owned model against the
   executing canonical contract's module ownership. Cover supporting-model-only
   writes as well as state-model writes.
2. Reject an unrelated contract's writes even when it has imported the model,
   uses the same command name, or bypasses actor staging.
3. Calling a module contract's program from an unrelated contract does not
   transfer authority. Invoking an exported contract means executing it through
   the existing command path.
4. A module contract may atomically change its own models and explicitly declared
   aggregate-owned models. It may not directly change another module's models.
5. Preserve state-route checks against the authoritative original state whenever
   the designated state row is touched or entered. Preserve creation rules,
   explicit entry on discriminator changes, and same-state re-entry.
6. Supporting-model-only writes require module membership. Any additional
   per-instance lifecycle checks belong in the module contract's explicit guards;
   do not infer instance ownership from foreign keys.
7. A failed ownership, route, or guard check rolls back the entire command,
   including changes to other models and activation enrollment.
8. Preserve Spec 012's captured activation inputs, execution outside the
   transaction, stale-output rejection, persisted results, interruption handling,
   and saved-command delivery.

### Views and adoption

1. Use exported module views for actor and session reads. Retain explicit query
   selection and identity binding; read access does not grant write access.
2. Preserve the effective model inventory and module ownership information in
   generated system metadata without requiring duplicate authored registrations.
3. Convert tic-tac-toe and the existing purchase-machine fixture to module
   construction and attachment.
4. Demonstrate factory customization in the purchase fixture by adding model data
   and extending a contract to write related rows alongside state entry.
5. Update affected architecture documentation, glossary terms, and local patterns
   so explicit module attachment is the supported composition boundary.

## Testing Decisions

1. Prefer the existing authoritative execution seam for ownership and atomicity
   tests, with focused declaration typechecks and one real-worker composition
   test.
2. Verify attachment of two modules plus directly owned aggregate models,
   including an aggregate with no directly owned models. Reject conflicting
   ownership and duplicate registrations.
3. Verify factory customization preserves inferred fields and payloads, uses the
   final contracts in routes, and commits added work with state entry.
4. Attempt creation, update, and deletion through unrelated contracts against
   both state and supporting models. Include supporting-only writes, a same-named
   foreign contract, and execution that bypasses staging.
5. Verify rejection rolls back all command mutations and creates no activation.
   Verify permitted module contracts can commit owned and aggregate-owned model
   changes together.
6. Verify actor contract selection and view identity isolation. Actor exposure
   must not grant unrelated contracts permission to write module data.
7. Verify module replacement and removal recompute effective models and reject
   stale actor or view references.
8. Retain the existing activation and delivery regression suites. Run scoped Nx
   checks for affected declarations, execution code, and examples during
   implementation.

## Out of Scope

1. New runtime owners, module databases, or module-specific command chains.
2. Nested contract invocation, cross-module orchestration, and cross-owner
   transactions.
3. A universal factory customization framework.
4. New instance inference, visibility inference, timers, or activation retry
   semantics.
5. Migration of Shopping's production checkout workflow.
6. Compatibility aliases, duplicate registration paths, translation migrations,
   and unrelated cleanup.

## Further Notes

1. This spec changes the declaration and ownership portions of
   [Spec 012](../specs/012-spec-aggregate-state-machines.md). Its activation, transaction,
   recovery, and delivery behavior remains the foundation.
2. “Module ownership” means ownership of declarations and the permitted write
   interface. The aggregate owns persistence and execution.
3. Follow the repository's pre-release hard cutover policy. If fixed storage
   schemas change, require empty storage rather than compatibility decoding.
4. Create an implementation plan only when requested, reusing number `013` and
   the `state-machine-modules` topic.

## Implementation Notes

- Owned models are local aggregate models. Service replicas remain explicit
  aggregate dependencies and cannot be module-owned.
- Exported view queries can be captured by a larger actor database when it
  contains the same canonical source models. Captured queries retain their
  source model dependencies and explicit identity bindings.
- Machine assembly and activation programs remain server-only. Browser sessions
  use the browser-safe model and contract declarations and receive the actor's
  selected projection.
- Generated system metadata now includes each module's owned models and full
  contract schemas. Existing persisted system specs require empty storage for
  this hard cutover; no compatibility decoder is provided.

## Verification

Verified on 2026-09-26 through scoped Nx targets:

- `@zerospin/core`: `ts`, `lint`, and `test` (41 tests).
- `system-worker`: `ts`, `lint`, and `test` (24 tests).
- `tic-tac-toe`: `ts`, `lint`, `test` (3 tests), and browser `build`.
- `system-worker:test:workerd -- machineActivations`: two tests covering module
  composition, customized transition output, activation delivery, deduplication,
  and rejection of forged machine provenance.

Existing lint warnings and Nx Cloud cache-access warnings remain. All listed
local targets passed. Scoped formatting and diff whitespace checks passed.
