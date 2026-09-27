---
name: System layer only
overview: A guard needs an Effect tag. makeSystem owns one runtime, the author layer merged with the default id and async layers. Delete owner layers and the worker singleton runtime.
todos:
  - id: drop-owner-layers
    content: Remove layer from service, aggregate, and actor definitions, including the __initializeRequirements pin and owner initializeExecution wrappers
  - id: system-runtime
    content: makeSystem builds system.runtime from the author layer merged with NanoIdFactory, UlidMonotonicFactory, ErrorLayer, and AsyncLive; repos and the gateway run on it
  - id: move-real-layers
    content: Move the two authored owner layers (shopping checkout, tic-tac-toe GameRandom) onto their system layer
isProject: false
---

# System layer only

**Status:** Archived at the maintainer’s request after implementation in [PR #23](https://github.com/morgs32/zerospin/pull/23). Recorded verification results and remaining acceptance limitations are preserved below.

The rename is the wrong cut. The alias exists because three layers are pretending to be one dependency bag.

## The only requirement

A guard is an Effect that uses a tag: `yield* SomeTag`. The tag is the requirement. An implementation is `Layer.succeed(SomeTag, impl)` or `Layer.effect`. Satisfying the guard is `Effect.provide` of that layer.

That layer belongs on the system. Creating the system is `makeSystem({ layer })`. Running the guard is providing that layer. Nothing else builds a layer, merges a context, or pins a phantom requirement channel.

`authorize` becomes: decode authentication, narrow the query, then run the authorizer on `system.runtime`. No `initializeExecution(service)`. No `makeServiceActorContext`. The service and the actor do not have layers.

`makeSystem` builds that runtime. `decodeSystemProps` returns `layer`, and the body destructures it once. No `props.layer` later in the function. The current `layer: props.layer ?? Layer.empty` return is the same violation and goes away with it.

```ts
const { layer = Layer.empty, name, aggregates, services } = decoded;
const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    NanoIdFactory,
    UlidMonotonicFactory,
    ErrorLayer,
    AsyncLive,
    layer,
  ),
);
```

`CuidFactory` and `MonotonicFactory` are the default id implementations (`NanoIdFactory`, `UlidMonotonicFactory`), not a separate worker bag. `managedRuntime` and `makeSystemRuntime` go away. Durable Object configs and the gateway use `config.system.runtime`.

The DO constructor calls `runSync` before the object is usable (`makeDORepo`). `ManagedRuntime.make` builds its layer on first run, so the author layer has to build synchronously. That is the constraint the singleton was protecting by refusing scoped loggers. It stays a constraint on `system.runtime`, not a reason for a second runtime.

## What goes away

- `layer` on services, aggregates, service actors, and aggregate actors, and the `__initializeRequirements` channel that records those layers.
- [`packages/core/src/execution/initializeExecution.ts`](packages/core/src/execution/initializeExecution.ts) and the service and aggregate wrappers that only forward `owner.layer`.
- [`packages/core/src/serviceActor/makeServiceActorContext.ts`](packages/core/src/serviceActor/makeServiceActorContext.ts) and [`packages/core/src/aggregateActor/makeAggregateActorContext.ts`](packages/core/src/aggregateActor/makeAggregateActorContext.ts). Both only fresh-build `actor.layer`.
- The `makeSystem` error that subtracts owner requirements from the system layer. A guard whose tag is missing from `system.layer` fails at the `provide` site, which is the actual check.
- Per-call `Layer.build(Layer.fresh(system.layer))`. The runtime already contains that layer.
- [`packages/system-worker/src/managedRuntime.ts`](packages/system-worker/src/managedRuntime.ts) and [`packages/system-worker/src/makeSystemRuntime.ts`](packages/system-worker/src/makeSystemRuntime.ts). The gateway copy is the same defaults without `ErrorLayer`.

The owner-layer spec that acquires and releases a local `CuidFactory` is testing the deleted machinery. Replace it with a guard that reads a tag from the system layer.

## The two layers that are real

Almost every owner layer is `Layer.empty`. Two are not, and both move onto the system:

- Shopping checkout actor: `PromotionDevelopmentLive` and `PaymentSimulation` in [`examples/shopping/src/zerospin/aggregates/shopper/actors/checkoutActor.ts`](examples/shopping/src/zerospin/aggregates/shopper/actors/checkoutActor.ts) (and `checkoutActorV3`). The shopping system currently passes no layer.
- Tic-tac-toe opponent: `GameRandom` in [`examples/tic-tac-toe/src/OpponentActorV1.ts`](examples/tic-tac-toe/src/OpponentActorV1.ts).

## Left in place

The browser runtime layer (`makeRuntime({ layer })`, frontend `initializeExecution`) is the browser process's one dependency bag. It is not an owner layer. This cut does not touch it.

## Patterns review — 2026-09-23

1. Reviewed shared managed-runtime RPC boundaries, boundary-owned layer provision, factory inference, and coordination-cost guidance with the current system/worker implementation. This is PR 4, based on `codex/version-keyed-registries` (PR 22). Keep one system-owned runtime and remove superseded owner/context/singleton paths outright; preserve the separate browser runtime.
2. The current worker default `ErrorLayer` already lives in Core, so moving default runtime construction to `makeSystem` introduces no package cycle. Update the canonical System type and fixed/migratable Repo/gateway boundaries together, including runtime error typing; do not cast away author-layer errors.
3. Preserve synchronous Durable Object initialization. Shopping's existing development layer performs a dynamic Worker import while acquiring the layer, so merely moving it to the system would violate that constraint. Keep the development restriction at capability invocation and make layer acquisition synchronous; never replace the restriction with an unconditional permission. Move the shared checkout simulation layer once to the Shopping system, and move GameRandom to the Tic-Tac-Toe system.
4. Remove owner `layer` fields, phantom initialization requirement channels, owner initializer/context wrappers, and per-call system layer rebuilding across declarations, upgrades, schema codecs, runtime callers, fixtures, exports, tests, and current documentation. Retain guard requirements as actual Effect requirements and preserve explicit public boundary validation.
5. Verify runtime identity and reuse across multiple calls, synchronous startup, author service availability, failed layer acquisition, and isolation between systems. Replace deleted owner-layer tests with system-runtime behavior tests. Run affected Core/worker/React/SDK/CLI/example checks with required dependency builds, and relevant Workerd constructor/recovery cases. The Shopping test-config missing-fixture blocker recorded in PR 22 remains separate from runtime correctness.

6. Current-source correction: `promotionService.ts` also installs `PromotionDevelopmentLive`; the original “two real layers” inventory omits this service owner. Remove that owner layer too and supply the same capability once from the Shopping system. Promotion reserve/commit/release/redeem guards consume the capability and must retain the invocation-time environment restriction.

7. Synchronous capability follow-up: promotion guards run through `runProgram`, so deferring a dynamic import until invocation still violates their synchronous contract. Read `process.env.ZEROSPIN_ENVIRONMENT` at invocation instead. Generated workers already use `nodejs_compat` and compatibility date `2026-01-20`, which supplies text bindings through `process.env` ([Cloudflare documentation](https://developers.cloudflare.com/workers/configuration/environment-variables/)). This also keeps CLI config imports valid in Node. Verify development success and production/missing-environment denial synchronously; never capture the environment while loading the config.

## Implementation and validation — 2026-09-23

Implemented on `codex/system-owned-runtime`, stacked on PR 22. `makeSystem` now owns the single managed runtime, with default and authored capabilities; live config validation requires that runtime while specs omit it. Removed server owner layers, initializer/context wrappers, worker singleton/factory, and their erased requirement channels. Worker gateways and Repo configurations use `config.system.runtime`. Browser runtime ownership remains separate; its lifecycle tests moved beside the frontend initializer. Shopping and Tic-Tac-Toe capabilities now live on their systems. Promotion checks read the environment synchronously when invoked.

The runtime boundary intentionally accepts dynamically resolved Effect requirements (`unknown`); concrete authored callback requirements remain in their Effect types. Missing services fail when the Effect runs, rather than through a phantom system-wiring type gate. New tests prove that failure, capability use inside a contract guard, synchronous acquisition, shared identity, isolation, partial cleanup, disposal, and live-config/spec separation.

Validation:

- Typechecks passed for Core, React, system-worker, CLI, Tic-Tac-Toe, dev-worker, and production-worker; dependency declaration builds passed.
- 63 focused Core tests, all 18 React tests, 9 CLI configuration tests, and Shopping's new synchronous development-capability test passed. All 6 worker execution-guard tests pass after migrating the hand-built system fixture. Prepared-payload fixtures now use one system runtime and no owner layers; historical payload/SQL assertions remain failing as on the parent.
- Full worker Node suite: 252 passed, 27 failed. A separate clean worktree at parent `b83c5676` reproduces the same 27 named failures (12 files); the cutover adds no failing cases. These include stale envelopes, payload identity/savepoints, replication/outbox expectations, and incomplete spec fixtures. No assertions were relaxed to turn them green.
- Four selected Workerd files: 7 passed, 1 failed. SystemRepo initialization, service actor access, and aggregate membership pass. The prepared-execution recovery assertion expects a Date where the wire contains a string; the same assertion fails on the parent.
- The production-worker Workerd target cannot load its existing `fixtures/serverActor.js` import from the TypeScript fixture. The parent reproduces this startup failure. Shopping's broader typecheck remains blocked by its pre-existing deleted test-fixture imports. Production/recovery acceptance remains incomplete until those existing blockers are addressed. Shopping browser verification was not run.
- Scoped lint reports no errors; existing style warnings remain. Formatting and `git diff --check` pass.

This is implemented with the above verification limits, not a claim of a fully passing repository or production acceptance suite.

Final stack audit (2026-09-24): removed the stale package export for the deleted `makeSystemRuntime` module. The System Worker package no longer advertises the removed runtime factory. The upstream Shopping actor filename corrections are preserved.
