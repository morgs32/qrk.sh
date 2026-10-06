# External contracts with recorded responses

**Status:** Complete — implemented and verified

## Summary

Replace `makeAsyncContract` with `makeExternalContract`. Keep emitted arguments in
`payload` and the external request's recorded return value in a flat `response`
column. Remove `asyncInput` and duplicated source-command provenance from generated
commands. Replay consumes the saved payload and response without executing the
external request.

```ts
makeExternalContract({
  payload: PaymentRequest,
  external: {
    response: PaymentEvidence,
    request: ({ payload }) => pay(payload),
  },
  program: ({ payload, response }) =>
    applyPayment({ ...payload, payment: response }),
});
```

## Contract interface and storage

1. Hard-replace the constructor, core exports, SDK export, callers, and type
   fixtures. Replace `external.result/program` with `external.response/request`.
   Programs and guards receive typed `response`.
2. Store declaration metadata directly as `contract.external`, replacing
   `contract.async.external`. Identify external contracts, validate emission
   registration, and exclude them from public session contracts through this
   declaration.
3. Replace authoritative command/history `asyncInput` columns with JSON
   `response`. Rename the producer record's `external` and `externalRecordedAt`
   columns to `response` and `responseRecordedAt`.
4. Require the `response` property on generated continuation commands, accepting
   explicit JSON null. Ordinary submissions have no response input. Shared
   nullable history columns do not identify kind or production completion.
5. Delete the old input schema and wrapper-only helpers. Keep source-command
   identity on the producing operation record.
6. Delete browser Node/session `asyncInput` columns and pass-throughs without
   adding browser response columns. Preserve reduced browser history.

## Execution and replay

1. Commit emitted payload, child identity, and production authority with the
   originating model transaction. Run `external.request` after commit and
   outside model transactions.
2. Validate and encode responses using `external.response`; atomically commit
   the immutable response, recording timestamp, and delivery intent in a
   synchronous transaction.
3. Reconstruct generated commands with flat response. Preserve trusted
   admission's retained-record comparison, owner/actor version pins, and
   repeated-delivery behavior.
4. Classify execution through the resolved `contract.external`. Establish
   production completion with `responseRecordedAt`, never response nullness.
5. Decode saved payload and response independently for synchronous guards and
   programs. Replay creates no production authority and requires no
   source-command or producer-record lookup.
6. Preserve timeout/retry defaults, request-side emission prohibition, business
   command names/versions, and durable async runner/outbox ownership.

## Verification and completion

1. Extend aggregate/service fixtures for missing, null, malformed, forged, and
   changed responses; verify idempotent delivery.
2. Replay retained child history after source and producer record removal, with
   a request that throws if invoked.
3. Run scoped Nx async contract, runtime restart, forwarding, actor-history, and
   staging checks, including recording/enqueue rollback.
4. Update Shopping fulfillment fixtures and run Node and Workerd suites while
   preserving payment-key, total, and tracking-sequence checks.
5. Run scoped core, SDK, worker, browser, and Shopping typechecks/lint. Refresh
   the Explorer schema catalog and run its typecheck, lint, and tests.
6. Update active architecture docs, patterns, and glossary after implementation.
   Retain [ADR 001](../../adrs/001-async-replay-retains-output-without-production.md)
   and do not create a new ADR for this representation change.
7. Require empty storage for changed fixed schemas. Add no compatibility
   aliases or decoders; preserve unrelated WIP.
8. Archive this plan after implementation and required verification complete.

## Outcome

1. Replaced the constructor, SDK export, authored declaration metadata, guards,
   callers, and fixtures. Generated commands and authoritative histories retain
   flat `response`; source identity remains solely on the producing operation.
   Ordinary submissions cannot supply responses. Browser histories retain their
   existing reduced fields without response columns.
2. Preserved synchronous source retention and atomic response/timestamp/outbox
   recording. Trusted delivery compares the complete generated command with
   pinned producer evidence; explicit JSON null completes production through
   `responseRecordedAt`. Replay uses retained payload and response, without
   invoking the request or requiring source/producer records.
3. Extended existing aggregate/service fixtures for missing, null, malformed,
   forged, conflicting, and repeated response delivery, typed owner guards,
   response/enqueue rollback, and replay after deleting source and producer
   records with a request callback that throws if invoked.
4. Updated active architecture docs, patterns, glossary, and the async lifecycle
   README. ADR 001 remains governing. Explorer's refreshed snapshot contains
   65 tables and 639 columns. Changed fixed schemas require empty storage; no
   compatibility aliases, decoders, or migrations were added. Unrelated WIP was
   preserved.

## Verification

1. Passed core, SDK, worker, browser, and Shopping scoped `tsc:typecheck`, extra
   `ts` checks where configured, and lint where available. Worker/Shopping final
   reruns used serial Nx execution to avoid concurrent build/typecheck writes to
   the same output directory. Existing unrelated core/browser curly warnings
   remain; lint reported no errors.
2. Passed `system-worker:async-contracts:check`, including mapped contracts,
   immutable recording/enqueue rollback, null responses for both owners, public
   submission rejection, complete delivery comparisons, repeated admission,
   replay-only cold activation, and retained-child replay after source cleanup.
3. Passed `system-worker:async-contracts:runtime-check` across source commit,
   interrupted provider, response recording, and admission restart boundaries.
   Recorded responses did not trigger new provider calls after restart.
4. Passed `system-worker:contract-programs:check`, including forwarding and actor
   history; `system-worker:command-history:restart:check`;
   `system-worker:actor-staging:check`; `system-worker:static-cutover:check`; and
   `@zerospin/core:node-outcomes:check`.
5. Passed Shopping's Node fulfillment check (`shopping:agent-preview:check`) and
   `shopping:test:workerd`: 3 suites, 14 tests. Payment keys, totals, tracking
   sequences, stale observations, and restart recovery remain verified.
6. Passed Explorer `typecheck`, `lint`, and `test`: 2 suites, 11 tests, after the
   final schema capture. Scoped formatting and `git diff --check` passed. Active
   source/docs scans found no retired constructor, async input wrapper, or old
   declaration paths.
7. Nx checks used the documented `--skipSync` option because existing unrelated
   project-reference drift blocks the sync gate. Local tasks passed; Nx Cloud's
   existing access warning (401) did not block local verification.

## Remaining work

None.
