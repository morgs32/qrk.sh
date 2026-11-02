# Zerospin Worker failure diagnostics

Investigated 2026-11-02. Scope: readable `pnpm dev` diagnostics for Wrangler's
`Uncaught #<Object>` output, including synchronous Durable Object initialization.
This is research and a proposed design, not an implementation or a diagnosis of
the specific repeated exceptions. Sources: Zerospin `3b33cd1205c62ee3d73a8c10ef7ce513cb3cf882`,
QRK's installed Effect 4.0.2 and Wrangler 4.128.0, and first-party documentation.

## Established facts

1. **Cloudflare permits asynchronous constructor initialization.**
   `blockConcurrencyWhile` gates incoming events until its callback completes;
   a thrown exception terminates and resets the object, and the callback has a
   30-second timeout. Logging must preserve initialization failure rather than
   allow requests into a partially initialized object.
   [Cloudflare Durable Object State](https://developers.cloudflare.com/durable-objects/api/state/#blockconcurrencywhile).

2. **Zerospin currently needs some initialization to finish synchronously.**
   `makeMigratableDORepo` resolves identity and the owner database with
   `managedRuntime.runSync(initialize(...))`, assigns the resulting fields, then
   gates registration, schema initialization, bootstrap, and activation.
   `AggregateVersionRepo` immediately uses `this.db` and `this.schema` in a
   derived field initializer. Moving only `initialize` into the async gate would
   break that construction order. ECMAScript initializes derived instance
   elements after constructing the superclass. This is a dependency in the
   current class design, not a Cloudflare requirement that all initialization be
   synchronous.
   [Constructor and gate](https://github.com/morgs32/zerospin/blob/3b33cd1205c62ee3d73a8c10ef7ce513cb3cf882/packages/system-worker/src/makeMigratableDORepo/makeMigratableDORepo.ts#L259-L318),
   [derived initializer](https://github.com/morgs32/zerospin/blob/3b33cd1205c62ee3d73a8c10ef7ce513cb3cf882/packages/system-worker/src/AggregateVersionRepo/AggregateVersionRepo.ts#L127-L140),
   [ECMAScript SuperCall evaluation](https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-super-keyword-runtime-semantics-evaluation).

3. **Capture is already separate from export.** `captureTelemetry` captures the
   original `Exit` and flushes the collector without an exporter. Its logger
   merges with existing loggers; it does not replace terminal logging. For a
   synchronous program with synchronously available services, capture itself
   does not require OTLP I/O. `runWorkerInvocation` then invokes
   `WorkerTelemetry.emit` and re-fails the original Cause. It adds no explicit
   terminal failure log. The exporter returns `null` when OTLP is unconfigured;
   QRK's config does not supply telemetry configuration.
   [Capture](https://github.com/morgs32/zerospin/blob/3b33cd1205c62ee3d73a8c10ef7ce513cb3cf882/packages/logger/src/captureTelemetry.ts#L16-L34),
   [logger composition](https://github.com/morgs32/zerospin/blob/3b33cd1205c62ee3d73a8c10ef7ce513cb3cf882/packages/logger/src/makeTelemetryLayer.ts#L10-L20),
   [invocation runner](https://github.com/morgs32/zerospin/blob/3b33cd1205c62ee3d73a8c10ef7ce513cb3cf882/packages/system-worker/src/runWorkerInvocation/runWorkerInvocation.ts#L21-L35),
   [optional exporter](https://github.com/morgs32/zerospin/blob/3b33cd1205c62ee3d73a8c10ef7ce513cb3cf882/packages/system-worker/src/repoServices/WorkerTelemetryLive.ts#L34-L83),
   [QRK config](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/zerospin.config.ts).

4. **`runSync` cannot wait for export.** Effect v4 reports `AsyncFiberError` if
   synchronous execution reaches asynchronous work. Zerospin additionally
   overrides `managedRuntime.runSync` with `runSynchronousExit`, which flushes
   synchronous continuations and interrupts suspensions while retaining
   synchronous cleanup failures. Replacing that execution policy with a stock
   runner would discard existing lifecycle behavior. A failure observer attached
   only to `initialize` cannot see reasons subsequently added by that completion
   policy; synchronous diagnostics must observe its final `Exit`.
   [Effect v4 execution documentation](https://effect.website/docs/v4/getting-started/running-effects#runsync),
   [configured synchronous execution](https://github.com/morgs32/zerospin/blob/3b33cd1205c62ee3d73a8c10ef7ce513cb3cf882/packages/core/src/system/make/makeConfig.ts#L117-L132),
   [synchronous completion policy](https://github.com/morgs32/zerospin/blob/3b33cd1205c62ee3d73a8c10ef7ce513cb3cf882/packages/shapes/src/runSynchronousExit.ts#L18-L75).

5. **The complete Cause must be observed before it is reduced to a thrown
   value.** Installed Effect 4.0.2's `runPromise` and `runSync` use `causeSquash`;
   it returns a typed failure's value or a defect unchanged, including an object.
   Zerospin already has `prettyUnknownFailure`, which handles a complete Cause,
   native stacks, and foreign objects, with bounded output. Wrangler's installed
   exception formatter reads the inspector's exception description and stack;
   it does not expand arbitrary object properties. Together these establish a
   plausible path to the observed summary, not the identity of the failing
   method or value.
   [Installed cause reduction](/Users/morgs32/GitHub/qrk.sh/node_modules/effect/src/internal/effect.ts:261),
   [installed Promise execution](/Users/morgs32/GitHub/qrk.sh/node_modules/effect/src/internal/effect.ts:5769),
   [installed synchronous execution](/Users/morgs32/GitHub/qrk.sh/node_modules/effect/src/internal/effect.ts:5812),
   [existing formatter](https://github.com/morgs32/zerospin/blob/3b33cd1205c62ee3d73a8c10ef7ce513cb3cf882/packages/error/src/makeZerospinError.ts#L64-L85),
   [installed Wrangler formatter](/Users/morgs32/GitHub/qrk.sh/apps/zerospin/node_modules/wrangler/wrangler-dist/cli.js:157923).

6. **An RPC `Failure` result and an escaping exception need different
   treatment.** `makeWorkerRpcEnvelope` also uses capture. `encodeRpcExit`
   resolves a single typed failure into a public `Failure` result, but can
   preserve other Causes as escaping defects. Logging every failed capture
   would therefore report normal business refusals as crashes; logging only
   `runWorkerInvocation` would miss defects escaping the RPC encoder.
   [RPC capture](https://github.com/morgs32/zerospin/blob/3b33cd1205c62ee3d73a8c10ef7ce513cb3cf882/packages/system-worker/src/runWorkerInvocation/runWorkerInvocation.ts#L38-L55),
   [RPC exit classification](https://github.com/morgs32/zerospin/blob/3b33cd1205c62ee3d73a8c10ef7ce513cb3cf882/packages/logger/src/encodeRpcExit.ts#L29-L55).

## Design conclusion

Use one failure-reporting policy at the seams where failures escape into native
execution. Preserve synchronous execution for identity/database construction and
asynchronous execution for gated startup and invocation delivery. The policy
should format the complete Cause, emit a readable error with existing operation
context, skip interruption-only cancellation, and preserve the original failure.
The recommendation follows the capture and encoding distinctions above; it is
not an assertion that every Effect failure should be logged.

The actual variation is synchronous versus asynchronous execution, and resolved
RPC business failure versus an escaping exception. These justify small concrete
execution paths sharing reporting semantics. They do not justify a configurable
runner factory or forcing initialization through an asynchronous exporter.
`captureTelemetry` can remain a quiet capture primitive. For failures already
known to escape while capture is active, reporting before collector flush can
retain the diagnostic in telemetry as well as the terminal. An encoder defect
that occurs after capture needs reporting at its own escape seam; an earlier
collector flush cannot include that later diagnostic. Export remains optional
and its failures must not replace the operation's original `Exit`.

Keep public error encoding unchanged. The fix belongs upstream in Zerospin's
invocation/lifecycle diagnostics, followed by a coherent release and QRK's exact
version update. Moving all owner setup into one async gate is possible only with
a deliberate redesign of the eager owner fields; it is unnecessary for the
reported diagnostic requirement. This conclusion revises the earlier suggestion
to add a separate constructor catch without shared ownership.

## Evidence limits

The pasted `#<Object>` output does not identify the failing method, Cause, object,
or retry source. Readable diagnostics or an inspector capture are still needed
to diagnose the underlying error. No live failure reproduction, tests, source
changes, package release, or storage reset was performed for this note. QRK's
installed Intent discovery was available; the upstream checkout's missing
Intent executable was reported and no replacement was installed.


## Implemented outcome

Zerospin [PR #114](https://github.com/morgs32/zerospin/pull/114) implements one
internal best-effort reporter for final synchronous initialization and the three
asynchronous escape seams. Invocation and internal RPC observers stay inside
existing interruption masks so actual cancellation cleanup defects remain visible.
The fixed package group was published as **38.2.1** to the configured local registry;
[QRK PR #51](https://github.com/morgs32/qrk.sh/pull/51) adopts matching exact pins
without modifying installed packages.

Verification: 22 upstream Workerd tests, system-worker typecheck/lint, and the
19 configured release-group library builds passed. QRK frozen install, all 17
backend tests, and App production build passed against the release. An isolated
`zerospin dev --port 18888` accepted its System spec and returned `healthy` through
the published RPC client. No unhandled exception recurred during that smoke test;
the earlier repeated live error remains unidentified. No production deployment,
primary-checkout dependency change, or storage reset was performed.
