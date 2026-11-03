# Reducing definition-stack startup work

Researched 2026-11-03 against Zerospin's current source, Effect 4.0.2, and the
saved QRK 39.0.0 startup profiles. Research only; no framework/application,
deployment, registry, storage, or test changes.

**Recommendation: first defer and cache definition-stack formatting inside
Zerospin.** Separately propose reuse of the same authored capture between wrappers.
Keep named spans and existing source/error diagnostics. Treat removing Effect's
definition captures as a separate diagnostic policy decision; the largest sampled
construction frame will remain after the conservative change.

## What currently happens

The four construction frames—Effect `fn`, logger `makeFn`, transaction `makeTx`,
and RPC `rpcMethod`—account for approximately **81.6 ms mean self samples**, about
31% of local active startup CPU. These frames include other construction work:
81.6 ms is neither isolated `Error` cost nor promised savings. The regular
Cloudflare Worker measured 709 ms; local profiles cannot predict its improvement.
[Existing measurements and limits](./worker-startup-and-cold-start-latency.md),
[profile](/private/tmp/qrk-startup-39/startup-1.cpuprofile).

- `makeFn` creates its definition `Error` immediately, but reads `.stack` through
  a thunk. Each invocation captures another `Error`. It directly creates a named
  span and installs invocation/definition `CurrentStackFrame` entries; it does
  **not** wrap `Effect.fn` a second time.
  [Implementation](/Users/morgs32/GitHub/zerospin/packages/logger/src/makeFn.ts:26).
- `makeTx` immediately captures, formats, splits, and parses its authored
  definition, then `makeFn` captures a second definition at the internal wrapper.
  [Transaction builder](/Users/morgs32/GitHub/zerospin/packages/core/src/drizzle/make/makeTx.ts:43).
- `rpcMethod` immediately captures and parses its definition. Its `makeFn`
  wrapper is constructed when executing a request, so that additional capture is
  request work, rather than this startup cost.
  [RPC declaration and wrapper](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/makeRpcApi/makeRpcApi.ts:237).

V8 captures frames when an `Error` is created and formats them upon the first
`.stack` access. Deferring the read saves startup formatting/parsing; deferring
`new Error()` changes the captured location to the later call site. A function's
name/version cannot recover its original file, line, and column.
[V8 stack-trace API](https://v8.dev/docs/stack-trace-api).

## Which guarantees matter

Source annotation runs during successful executions too, whenever a real span
exists. Explicit transaction/RPC definition attributes override wrapper locations.
`functionSpanSource` chooses the first matching frame; it does not search for an
authored file. Preserve the existing call-site slicing and distinguish definition
from invocation.
[Annotation](/Users/morgs32/GitHub/zerospin/packages/logger/src/annotateFunctionSpan.ts:233),
[parser](/Users/morgs32/GitHub/zerospin/packages/logger/src/functionSpanSource.ts:8).

Source attributes are optional generic JSON on the wire and in Devtools, so
omitting them is schema-compatible. It still loses diagnostics: method-profile
guidance promises full authored definition locations when available, and failed
spans use `Cause.pretty`, which also consumes Effect's logical stack information.
Checking only the JSON attributes would miss that second use.
[Wire attributes](/Users/morgs32/GitHub/zerospin/packages/logger/src/types.ts:23),
[Devtools](/Users/morgs32/GitHub/zerospin/packages/devtools/src/sessions/sessions/sessionId/logs/TraceSpanDetails.tsx:53),
[profile guarantees](/Users/morgs32/GitHub/zerospin/wiki/patterns/testing/codes-only-explorers.md:35),
[failed-span rendering](/Users/morgs32/GitHub/zerospin/packages/logger/src/makeTelemetryTracer.ts:58).

## Smallest upstream experiment

1. Keep capturing the authored definition at declaration time. Defer and cache
   the `.stack` read and source parsing in `makeTx`/`rpcMethod` until diagnostics
   first need them, including successful execution. RPC already constructs its
   span options per execution; transactions can annotate the current span through
   their existing Effect execution path. Keep diagnostic failures non-fatal.
   [Current-span annotation API](/Users/morgs32/GitHub/qrk.sh/node_modules/effect/src/Effect.ts:17037).
2. Optionally propose internal source plumbing that lets these wrappers supply
   that same authored capture to `makeFn` for both its source attribute and definition
   stack frame. `makeFn` currently has no capture-input parameter: this would be
   an upstream API change requiring a concrete proposal before implementation.
   It could avoid the redundant internal definition capture. This belongs
   in Zerospin's logger/core/Worker implementation, with no QRK wrappers or
   caller-supplied metadata machinery.
3. Measure retained memory and first invocation too: lazy captures retain an
   `Error` longer than today's compact parsed location. Cache the result once
   and release captured objects when their retained diagnostic data permits.

These changes reduce or shift work; they do not eliminate declaration-time
capture. Effect `fn` itself already bounds its definition capture to two frames,
yet its construction frame contributed approximately 45.9 ms of the sampled
total. Do not assume shallower capture removes that cost.
[Effect definition capture](/Users/morgs32/GitHub/qrk.sh/node_modules/effect/src/internal/effect.ts:1275).

## Larger alternatives

Effect supports named spans without source-stack capture:

```ts
Effect.fnUntraced(
  function* () { /* authored body */ },
  Effect.withSpan('method', undefined, { captureStackTrace: false }),
);
```

The **third argument** matters: plain `withSpan` captures a stack too. An inline
Node 24.13.1/Effect 4.0.2 diagnostic retained span name `probe` and a named frame
with no source stack. This is an API sanity check, not a Worker performance
measurement. It loses the `fn` invocation/definition frame pair; it is not a
drop-in replacement for `makeFn`'s argument/exit/source annotation. Effect exposes
no equivalent per-function capture switch in `Effect.fn`'s span options.
[API](/Users/morgs32/GitHub/qrk.sh/node_modules/effect/src/Effect.ts:17526),
[capture behavior](/Users/morgs32/GitHub/qrk.sh/node_modules/effect/src/internal/tracer.ts:10),
[untraced function](/Users/morgs32/GitHub/qrk.sh/node_modules/effect/src/internal/effect.ts:1247).

A deliberate production definition-capture policy could preserve span names
while giving up definition locations. Build-time location injection could instead
preserve them without runtime capture, but needs broader upstream API/compiler
support and source-map validation. Neither is part of the minimal experiment.
Avoid a global `Error.stackTraceLimit` change, which affects unrelated diagnostics.

## Required validation before adoption

Compare repeated identical-bundle workerd startup profiles, then Cloudflare's
actual startup measurement under deployment authorization. Verify successful and
failed spans retain names, hierarchy, arguments/exits, authored definition and
invocation locations, and useful `Cause.pretty` stacks. Exercise transaction and
RPC wrappers, source maps, missing-location behavior, first-use CPU, and retained
memory. Use existing test/profile infrastructure; no new runner is needed.
Invocation parsing that occurs despite an already supplied RPC invocation
attribute is a separate request-time optimization, outside this startup slice.
[Invocation parsing](/Users/morgs32/GitHub/zerospin/packages/logger/src/annotateFunctionSpan.ts:248).
