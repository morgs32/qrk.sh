# Effect v4 startup timing

Investigated 2026-10-23 against official v4 documentation, first-party examples,
and QRK's installed Effect 4.0.2 source. The logging primitives already exist;
startup timing does not require a separate timing framework.

## Prior art

1. Use `Effect.withSpan` or a named `Effect.fn` for operation lifetimes and nested
   phase spans. Effect's first-party observability example demonstrates this
   composition. [Tracing documentation](https://effect.website/docs/v4/observability/tracing),
   [first-party example](https://github.com/Effect-TS/effect-smol/blob/main/ai-docs/src/08_observability/20_otlp-tracing.ts).
2. Use `Effect.logInfo` and `Effect.annotateLogs` for milestones and correlation
   fields. `Effect.withLogSpan` adds elapsed-at-log-time context to enclosed log
   calls; it does not emit a completion record independently. The v4 name is
   `withLogSpan`, not `logSpan`. [Logging documentation](https://effect.website/docs/v4/observability/logging),
   [logger source](https://github.com/Effect-TS/effect-smol/blob/main/packages/effect/src/Logger.ts).
3. `Effect.timed(program)` returns duration and result on success. To inspect a
   failed duration, `Effect.timed(Effect.exit(program))` returns duration and the
   original Exit; callers must preserve its failure when resuming execution.
   A temporary executable probe verified this against installed 4.0.2.
   [API source](https://github.com/Effect-TS/effect-smol/blob/main/packages/effect/src/Effect.ts).
4. Installed 4.0.2 implements `timed` using `monotonicTimeNanosUnsafe`; trace
   timestamps and native log-span elapsed values use different clock semantics.
   The browsed upstream main implementation differs, so exact clock behavior
   must follow the installed version. [Upstream implementation](https://github.com/Effect-TS/effect-smol/blob/main/packages/effect/src/internal/effect.ts).

## Zerospin integration

Zerospin's native Effect logger captures annotations, causes and trace IDs into
the existing telemetry collector. Its logger previously omitted
`References.CurrentLogSpans`. Preserving those as ordered `{ name, elapsedMs }`
entries under `payload["effect.logSpans"]` fits the existing JSON log payload and
requires no telemetry schema or DevTools renderer change. The tracer deliberately
does not retain span events, avoiding duplicate capture of ordinary Effect logs.

SharedWorker delivery is separate from Effect's timing primitives. The prepared
implementation forwards existing telemetry batches through an optional attachment
callback, before model subscription. It preserves worker-owned traces, observer
isolation and failure outcomes. Native diagnostics default off and the planned
QRK activation enables them only for development.

## Implementation and verification status

QRK frontend timing is implemented; its App build passes. A browser reload
emitted frontend milestones and exactly one failed startup summary for the
currently unavailable backend. Existing unrelated site-ID type errors remain.

The native implementation is committed as `3b9669571d` in
[Zerospin PR #60](https://github.com/morgs32/zerospin/pull/60), stacked on
[PR #59](https://github.com/morgs32/zerospin/pull/59) at `28053bd8ef`.
The clean worktree is `/private/tmp/zerospin-startup-timing-pr`. It preserves the
base branch's committed SharedWorker factory API and excludes unrelated
uncommitted worker/Studio changes.

All 22 scheduled library build, typecheck and lint tasks passed. Existing
error/browser regressions passed all 10 tests in 3 files, including full
test-program compilation. Temporary probes additionally cover real SQLite Node
opening/reuse, actual capnweb attachment and MessagePort cancellation, observer
fanout, typed backend failure/retry, replay, disabled diagnostics and bounded
delivery drains. Diagnostic cancellation returns immediately while the port stays
available for final records for at most one second. Network, WebSocket and
IndexedDB-discovery boundaries were mocked; these probes do not establish real
authenticated browser startup.

The requested predecessor chat completed before PR #60 was created. Remaining:
review/merge the stacked PRs, publish a coherent committed development release,
update QRK's exact dependencies/lockfile, apply
`/private/tmp/qrk-startup-native-activation.patch` (diagnostics flag only), and
complete real browser success/reuse and two-tab verification. No package release
or storage reset was performed for this implementation.
