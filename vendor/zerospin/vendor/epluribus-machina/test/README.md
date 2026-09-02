# Core tests

The Core suite tests canonical private State, Route, and Machine classes, strict
Schema validation, direct Machine State maps, sparse executable Machine routes,
State Handles, and Actor lifecycle behavior through public seams. Focused specs
are colocated with their source subjects. MachineActor contract specs live
together under `src/makeActor/tests`; the deploy benchmark remains in this
integration test tree.

| Seam              | File                                                                                      | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State             | [`makeState.spec.ts`](../src/makeState/makeState.spec.ts)                                 | Private `State` class descriptors, `stateName` values, strict native Schema failures, rejected excess and reserved fields, rejected `"__proto__"` State names, Schema-backed value construction, encoding/decoding, defaults, checks, and defects                                                                                                                                                                                            |
| Machine           | [`makeMachine.spec.ts`](../src/makeMachine/makeMachine.spec.ts)                           | Private `Machine` and `Route` class values, canonical State markers and keys, concrete initial-State validation, exact generated sparse routes, native Schema failures, decoded snapshots, split shared command wrappers, and preserved State/Schema/program references                                                                                                                                                                      |
| Machine types     | [`makeMachine.typecheck.ts`](../src/makeMachine/makeMachine.typecheck.ts)                 | Readonly State/Machine fields, compile-time `"__proto__"` State rejection, inline origin/payload inference, exact route shape, registered success types, activation failure exclusion, command failure/service inference, shared-program annotations, and invalid initial values                                                                                                                                                             |
| Actor types       | [`makeActor.typecheck.ts`](../src/makeActor/makeActor.typecheck.ts)                       | ManagedRuntime Route-and-save service coverage, runtime-error propagation to `ready` and the owner Fiber, save State-value inference, save-local Scope provision, typed save-error rejection, environment-free startup and Handles, command errors, and returned Handle unions                                                                                                                                                               |
| Actor contract    | [`makeActor/tests`](../src/makeActor/tests)                                               | Canonical Machine class markers, strict pre-resource Machine revalidation, rejected spreads/wrong markers/mutated-invalid instances, explicit one-shot startup, subscriber-ready `onActivation` chains, one current activation, validated State commits, automatic save-before-publication, exact-Cause terminal defects, inferred command failures, stale Handles and automatic completions, caller serialization, and Fiber-owned shutdown |
| Program success   | [`validateProgramSuccess.spec.ts`](../src/makeActor/tests/validateProgramSuccess.spec.ts) | Missing `stateName`, unregistered States, State Schema failures, deterministic placement paths, and exact valid-value retention                                                                                                                                                                                                                                                                                                              |
| Actor runtime     | [`actor-layer.spec.ts`](../src/makeActor/tests/actor-layer.spec.ts)                       | Lazy ManagedRuntime acquisition, service sharing across Actors using one runtime, isolation across distinct runtimes, acquisition-failure cleanup, runtime finalization, and actor interruption without premature Layer release                                                                                                                                                                                                              |
| Handle Store      | [`makeHandleStore.spec.ts`](../src/makeActor/tests/makeHandleStore.spec.ts)               | One-shot current Handle reads plus active and late Handle subscribers through one `SubscriptionRef`                                                                                                                                                                                                                                                                                                                                          |
| Deploy activation | [`deploy-activation.spec.ts`](deploy-activation/deploy-activation.spec.ts)                | Durable linked-deploy workflow, activation transitions, failure boundaries, retries, and reconciliation                                                                                                                                                                                                                                                                                                                                      |

Key invariants:

1. `makeState` and `makeMachine` return instances of private classes. Public
   `State` and `IMachine` types expose readonly domain fields; class constructors,
   Schemas, and guards stay private. Spreads and plain structural copies are not
   canonical.
2. Each State descriptor retains a `stateName` value Schema and callable `make`
   field. State names reject `"__proto__"` at compile time and runtime, while
   command names remain arbitrary strings—including an own `"__proto__"`
   property.
3. Machine validation first decodes a non-empty, string-keyed State-map snapshot
   containing only canonical State instances with exact fields and matching
   keys/names. State-map failures precede initial and Route validation.
4. Validation then derives an exact sparse Route Schema from those State keys.
   Each placement owns `onActivation`, non-empty `commands`, or both; every
   command is exactly `{ payload, program }`, with an Effect Schema and callable
   program. Unknown State keys, symbols, empty placements, and all excess fields
   fail, while terminal or disconnected States need no Route entry.
5. The concrete initial value must name a registered State and satisfy that
   State's exact generated Schema. Invalid factory inputs synchronously throw
   Effect's native `SchemaError`; Core has no parallel Machine-validation error
   taxonomy.
6. Machine construction retains decoded State-map and Route snapshots. Nested
   containers and shared command wrappers may be reconstructed independently,
   while State descriptors, payload Schemas, program functions, and the initial
   value retain reference identity.
7. Core does not runtime-freeze declarations, Route containers, Handles,
   command maps, Actor/store facades, or copied contract data. Public readonly
   fields are compile-time contracts; mutation after validation is unsupported
   and unspecified. Keep the suite free of runtime-freezing implementation and
   freezing assertions.
8. `makeActor` requires the canonical Machine class marker, regenerates the
   State-derived data Schema, and strictly revalidates current own fields before
   runtime or Actor resource acquisition. It discards the decoded validation copy and runs
   the supplied Machine instance; invalid spreads, markers, and mutated contents
   defect with the native `SchemaError` before resource acquisition.
9. `onActivation` stores its `Effect.fn` directly. Every command owns a required
   payload Schema and program; `Schema.Void` produces a zero-argument Handle
   method whose program receives `payload: undefined`.
10. Inline programs infer their placement-specific origin and payload. Extracted
    shared programs or command objects use caller-authored input annotations.
    Activation failures are excluded at the type boundary; command failures and
    services remain the program's inferred Effect types.
11. A successful program may return any registered State value. Runtime
    invocation requires a registered `stateName` and validates the value against
    that State's Schema before committing a fresh activation.
12. `makeActor` synchronously validates the Machine and returns an inert Actor
    bound to a caller-owned `ManagedRuntime`. Actors using the same runtime share
    its lazily built services; distinct runtimes isolate them. Startup and
    Handles are environment-free.
13. `actor.start()` synchronously returns the owner Fiber. It is strictly
    one-shot: every later call throws synchronously while starting, running,
    failed, or interrupted. Retry requires a new Actor.
14. `getHandle()` and the current-first `handleStream` exist before startup.
    The getter reads one current snapshot; the Stream observes that Handle and
    later replacements. `actor.ready()` reports runtime acquisition failure or
    confirms the initial-Handle startup barrier. One-current-activation
    semantics, serialized commands, stale-Handle `StateInactive`, cancellation,
    and activation-Scope finalization remain independent lifecycle contracts
    owned by the Actor Fiber.
15. An optional Actor-owned save Effect receives each current validated origin
    and destination before destination publication. Its services join Route
    services in the supplied runtime, its direct resources use a fresh save Scope,
    and its typed failure channel is `never`.
16. Save, destination-installation, and current activation-program defects
    terminate the Actor Fiber and preserve one exact Cause for the initiating
    operation, active and late Fiber observers, and later commands. The Handle
    Store retains its last committed Handle; `getHandle()` and `handleStream`
    remain state-only and never encode termination.
