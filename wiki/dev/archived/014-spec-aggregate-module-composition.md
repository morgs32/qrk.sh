# Aggregate and session module composition

**Date:** 2026-09-26
**Status:** Implemented

## Problem Statement

The aggregate factory requires one `module` containing all models, contracts,
and automations. Simple aggregates must introduce a wrapper, while aggregates
using several domain modules must manually merge three collections into a
synthetic module before attachment. The public interface hides the intended
ability to compose several modules alongside aggregate-local declarations.
The browser `makeSession` factory imposes the same single-module wrapper on
aggregate and service sessions, including a manual purchase/fulfillment merge
in the domain-modules example.

## Solution

Accept flat `models`, `contracts`, and `automations` properties and an optional
`modules` record on aggregate versions. The factory combines these inputs into
the aggregate's effective declaration collections, rejecting duplicate names.
Domain modules remain plain declaration bundles with no separate runtime owner.
Apply the same composition interface to both kinds of browser session, retaining
their existing restrictions on which declarations they can expose.

```ts
// Tic Tac Toe: direct declarations, no module wrapper.
{
  models: { game },
  contracts: { createGame, playX, playO },
  automations: { computerTurn },
  actors: { human },
}

// Shopper composition: reusable modules plus local declarations.
{
  modules: { purchase, fulfillment },
  models: { cart, cartItem },
  contracts: { addToCart },
  actors: { shopper },
}
```

These snippets illustrate declaration placement; existing aggregate identity,
version, actor, and guard requirements still apply.

Browser sessions can likewise attach `modules: { purchase, fulfillment }`, use
flat declarations alone, or combine modules with local declarations. Here these
are the browser-safe domain bundles, not the server modules with automations.

## User Stories

1. As an aggregate author, I can supply declarations directly without creating
   a module for a small domain such as Tic Tac Toe.
2. As an aggregate author, I can attach several reusable modules without
   manually merging each collection or repeating their declarations.
3. As an aggregate author, I can add local declarations alongside modules.
4. As a shopper example reader, I can see purchase and aggregate-side fulfillment
   composed as two modules while fulfillment processing remains service-owned.
5. As an actor or guard author, I retain precise types and access to the complete
   effective aggregate model inventory.
6. As an aggregate author, I receive an error for conflicting declaration names
   instead of attachment order silently choosing a winner.
7. As a browser session author, I can compose browser-safe modules and local
   declarations without a synthetic wrapper, for aggregate or service sessions.
8. As a browser session consumer, I retain precise model and command types
   without gaining server-only commands or automation execution.

## Implementation Decisions

1. Replace singular `module` with optional plural `modules`, a named record of
   ordinary declaration bundles. Add optional flat `models`, `contracts`, and
   `automations`; omitted collections and omitted modules contribute nothing.
   Apply the same interface to aggregate creation and upgrades.
2. Combine each declaration kind across local declarations and all modules.
   Reject duplicate keys within a kind, including repeated references to the
   same object. Module names organize authoring; they do not namespace model,
   contract, or automation names and introduce no precedence rules.
3. Preserve exact declaration object identity. Run existing model, contract,
   automation, actor, guard, and replica service-version validation against the
   combined inventory. Resolve references after composition so a contract can
   reference declarations supplied by another module or by the aggregate.
4. Infer the combined inventory for returned aggregate types, actor selection
   constraints, and guard callbacks. Keep the effective flat `models`,
   `contracts`, and `automations` as the runtime declaration inventory. Remove
   the superseded singular aggregate `module` field and consumers of it; do not
   construct a synthetic replacement bundle or add a runtime module registry.
5. Make Tic Tac Toe use only flat declarations. Update the existing purchase
   consumer's shopper composition to attach purchase and aggregate-side
   fulfillment through `modules`, removing its synthetic `userModule` merge.
   Actor database construction still uses the same final model objects.
6. Keep the fulfillment service responsible for fulfillment processing. The
   shopper's fulfillment module supplies the aggregate-side replica and
   integration. Module composition adds no storage ownership, execution owner,
   independent version axis, or new module factory abstraction.
7. Hard-cut all aggregate call sites, fixtures, and affected documentation to
   the new interface. Existing inline wrappers can become flat declarations;
   existing reusable bundles can be attached through `modules`. Update the
   glossary and local domain-module pattern to describe aggregate composition
   inside the factory rather than requiring premerged attachment.
8. Replace singular `module` on both `makeSession` variants with optional
   `modules` and optional flat declaration collections. Use the same empty
   defaults and duplicate rejection rules as aggregates. Compose before
   constructing the existing flat session definition and browser contract
   bindings; do not add module ownership to session definitions or storage.
9. Preserve browser restrictions across both local and module declarations:
   neither session kind accepts nonempty automations; service sessions expose
   authoritative models only and no contracts. Aggregate session contracts must
   remain valid against the combined model inventory. Composition must not
   silently discard forbidden declarations or expose server-only commands.
10. Infer session models, browser contract bindings, and application-layer
    requirements from the combined declarations. Preserve existing identity,
    actor/version binding, initialization, disposal, and authentication behavior.
11. Remove `makeShopUserFrontendModule` and its manual merge from the
    domain-modules browser example; attach its existing browser-safe purchase
    and fulfillment bundles directly. Migrate all `makeSession` callers and
    fixtures from singular wrappers, using flat declarations for simple
    sessions, and update affected session documentation.

## Testing Decisions

1. Use the public aggregate factory as the primary runtime test seam. Cover a
   flat-only aggregate, modules-only aggregate, and mixed aggregate. Verify the
   complete effective collections and preservation of declaration identity.
2. Reject duplicate models, contracts, and automations both between modules and
   between a module and local declarations. Include identical-object duplicates
   and verify reversing module order cannot turn a conflict into success.
3. Exercise cross-module contract/model and automation/contract references,
   actor membership, and conflicting replica service versions through factory
   construction. Existing validation must operate on the combined inventory.
4. Add focused compile-time coverage for combined model, contract, and
   automation inference and contextual guard typing. Cover aggregate upgrades
   through the same public interface.
5. Typecheck the migrated Tic Tac Toe example and purchase consumer composition,
   plus affected aggregate callers. Verify the purchase/fulfillment composition
   retains its existing behavior through existing domain tests.
6. Reuse the service factory's duplicate-declaration tests and purchase consumer
   typecheck example as prior art. Do not introduce tests for a compatibility
   path or a separate runtime module mechanism.
7. Test composition through public `makeSession` construction for both aggregate
   and service sessions: flat-only, modules-only, and mixed declarations, plus
   duplicate rejection across modules and local declarations. Inspect the
   resulting definition without requiring a live backend.
8. Verify session restrictions for declarations supplied locally or through a
   module: reject nonempty automations, service-session contracts, and
   service-session replicas. Preserve aggregate contract/model validation after
   composition.
9. Add compile-time checks for combined session model and command inference and
   contract layer requirements. Retain the domain-modules example's negative
   checks for server-only completion and fulfillment commands. Typecheck affected
   session callers and run existing session lifecycle/backup tests after their
   fixture migration.

## Out of Scope

1. Changing the service factory's version-keyed `module` interface. This
   exclusion does not apply to service sessions, which are in scope.
2. Redesigning Shopping checkout or replacing its payment lifecycle with the
   separate reusable purchase example. Its aggregate call sites still receive
   the required interface migration.
3. Introducing module namespaces, override precedence, module-level write
   ownership, or runtime module execution.
4. Storage migrations, compatibility aliases, and acceptance of the superseded
   singular aggregate or browser-session `module` input.

## Further Notes

The user approved the flat declaration and multiple-module design in chat.
Implementation and verification are recorded in [Plan 014](./014-plan-aggregate-module-composition.md). The shopper composition example refers to the existing reusable
purchase/fulfillment consumer, which already demonstrates both domain modules.
The user also approved extending the same composition interface to aggregate
and service browser sessions while preserving browser restrictions.
