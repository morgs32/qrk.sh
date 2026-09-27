# Aggregate and session module composition

**Status:** Implemented and verified
**Source:** [Spec 014](./014-spec-aggregate-module-composition.md)

## Implementation

1. Add shared declaration composition types and checked collection composition in
   core. Preserve declaration identity, reject duplicate keys, and default absent
   collections to empty. Keep module names authoring-only.
2. Update aggregate creation and upgrades to accept flat declarations and optional
   `modules`, validate the combined inventory, infer guard and actor model types,
   and remove singular `module` from authored aggregate results.
3. Update both browser `makeSession` variants with the same composition inputs.
   Infer combined contracts and layer requirements; reject browser automations
   and service-session contracts and replicas before constructing definitions.
4. Migrate aggregate and browser-session callers and fixtures. Flatten simple
   wrappers, compose purchase/fulfillment directly in consumer examples, and
   leave service factories' version-keyed `module` interface unchanged.
5. Update the glossary, authored-system documentation, and domain-module pattern
   to describe factory-owned composition.

## Verification

1. Add factory tests for flat, modules-only, and mixed declarations; duplicate
   rejection; cross-module references; and existing membership/service-pin checks.
2. Add session construction tests for both session kinds, combined definitions,
   duplicates, and forbidden browser declarations. Add compile-time assertions
   for model/contract inference, guard typing, and application-layer requirements.
3. Run scoped Nx library/type checks, lint, and tests for core, browser, reusable
   domain modules, and affected examples/fixtures. Inspect remaining singular
   module usages to distinguish service factories from missed migrations.
4. Format changed files, check the final diff, record results here, and archive
   this plan only when implementation and required verification are complete.

## Constraints

1. Hard cutover: no singular aggregate/session module compatibility or storage
   migration. No runtime module registry or separate execution owner.
2. Preserve Shopping checkout behavior and all session lifecycle behavior.
3. Use the existing purchase/fulfillment consumer for the two-module example;
   service processing stays in the fulfillment service.

## Verification results

1. Implemented flat declarations and optional `modules` for aggregate creation,
   upgrades, and both browser session kinds. Migrated all aggregate/session
   wrappers, including the Workerd purchase fixture's shorthand attachment.
2. Added aggregate and browser-session construction tests, exact inference and
   guard checks, cross-collection model references, and module-provided session
   capability checks. Existing lifecycle/backup tests remain green.
3. Passed scoped Nx `ts`, `test`, and `lint` targets for core, browser, purchase,
   fulfillment, Tic Tac Toe, and the domain-modules fixture (where targets exist).
4. Passed scoped Nx `ts`, `test`, and `lint` targets for Shopping, system-worker,
   and CLI. Dependency builds also validated the migrated default config.
5. Passed `system-worker:test:workerd purchaseFulfillment.workerd.spec.ts` under
   `CI=true`, exercising purchase submission through fulfillment and enrollment.
6. Formatting and `git diff --check` passed. Nx reported remote-cache permission
   warnings; local checks completed successfully. No Shopping browser tests ran.
