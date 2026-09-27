# Typed business failures and consolidated RPC envelopes

**Status:** Archived on 2026-09-23; implemented or superseded, remaining verification deferred.

The implementation record below describes the original delivery design. [Plan 007](./007-plan-failure-recognition.md) replaces mandatory version adapters and persisted bound failure views with recipient recognition. Inline `failures` records replace authored singular codecs; original provenance and producer validation remain.

## Archive checkpoint — 2026-09-23

The original implementation and its historical verification are recorded below. [Plan 005](./005-plan-scoped-command-validation-and-yieldable-errors.md) supersedes plain-object runtime errors, guard authoring, and the old result helper names; [Plan 007](./007-plan-failure-recognition.md) supersedes failure adapters and adapted views with recipient recognition. Remaining integrated verification is recorded in [TODOS.md](../../../TODOS.md#specs-001002004--deferred-verification).

Archived under the maintainer’s verification-only closeout instruction. No tests or builds were rerun for this archival; historical passing or failing results are not claims about the current checkout.

## Agreed design

1. Contract versions declare an optional, discriminated plain-object business-failure Effect codec. Omission means no declared business failures. The guard and program share the declared union; authoring inference and runtime validation reject undeclared failures.
2. Framework failures are plain tagged values constructed with `makeZerospinError`. They remain separate from business outcomes. Defects, interruption, and infrastructure failures must not accidentally become business refusals.
3. Admission refusals retain the submitted contract version; execution failures retain the executing version. Preserve the original authoritative failure and its exact encoding version. Hash retained encoded representations without replacing them with session-adapted values.
4. Adapt failures through the contract lineage into each session's bound version, validating every destination. Require explicit adapters when schemas change. Missing or invalid adapters fail delivery without acknowledging application or discarding pending reconciliation.
5. Rich business values use synchronous, context-free persistence codecs. RPC carries decoded values. Framework diagnostic fields remain separate from the versioned business-failure schema; there is no new framework-extra schema registry.
6. Internal RPC envelopes carry full telemetry batches. External API envelopes carry only persisted trace links. Consolidate result handling through `makeRpcEnvelope`, preserving capability-returning methods and the distinction between resolved failures and rejected promises.
7. Capture formatted Effect causes before extracting failure values. Keep diagnostic traces in telemetry rather than requiring native Error construction stacks. Telemetry acknowledgements must not recursively persist telemetry; telemetry failure must not replace settled domain outcomes.
8. Hard-cut superseded APIs, callers, schemas, tests, and documentation without compatibility aliases or fallback decoders. Changed fixed storage requires empty storage. Do not reset storage as part of implementation.

## Implementation record

1. Framework failures are plain tagged values. `makeZerospinError`, the fixed-code factory, structural schema, formatting, and persistence helpers replace the Error subclass and its JSON/display variants. Effects fail explicitly; failed spans capture formatted causes before extracting values.
2. `makeContractVersion` and `upgradeContractVersion` accept the optional failure codec and typed `failureUp` / `failureDown` edges. `InferFailure` preserves historical versions. Omission declares `never`. Runtime validation requires a plain object with a unique, non-framework literal tag. Programs and guards share the declared union.
3. Authoritative business failures retain `{ _tag: 'BusinessFailure', commandName, contractVersion, encoded }`. Binding-guard and program failures use the executing version. Encoding and decoding run synchronously, reject unsupported JSON values, and require no service context. Framework guard failures propagate without becoming retained refusals.
4. Admission rows, execution history, selection outputs, journals, and snapshots retain the original failure. Aggregate, service, and selection hashes include its canonical retained representation; adaptation never changes those bytes. Published System specs lock every historical failure schema in `failureSchemas`; session locks include their selected failure schema.
5. Delivery walks explicit failure adapters and validates each destination. Reusing the same codec needs no adapter. RPC exposes the decoded bound-version `failure` alongside `originalFailure`. Selected delivery additionally carries `failureView`, a bound-version encoding for local persistence and offline recovery. JSON WebSockets carry the original failure and that encoded view. The browser validates the view before changing cursors, journals, or optimism. A missing or invalid view blocks reconciliation.
6. Preflight and staging infer decoded failures. `resolveFailure` and `resolveSessionFailure` expose typed persisted outcomes. Shopping's cart-freeze refusal demonstrates typed `CartFrozen` feedback.
7. Internal RPC uses `{ result, telemetry }` produced by `makeRpcEnvelope` and consumed by `readRpcEnvelope`. External APIs return `{ result, link }`, emitting links only after telemetry persistence succeeds. Telemetry persistence failure cannot replace the settled domain result. Its acknowledgement collects no recursive telemetry. Capability-returning methods retain their capabilities; rejected calls and defects stay distinct from resolved Failure results.
8. Local plain-result utilities are named `settleResult`, `readResult`, `resultSuccess`, and `resultFailure`; their type is `IResult`. The superseded RPC encoding/decoding names have no aliases.

## Storage and verification

This changes fixed schemas, System specs, and disposition hashes. Deployment requires empty storage under the pre-release hard-cutover policy. No application storage was reset during this implementation; test fixtures use disposable databases.

Verified on 2026-09-21:

- Affected Nx typechecks and Node suites pass for Core, system-worker, logger, error, backup-worker, session, React, SDK, CLI, Shopping, and sync. Coverage includes historical authoring inference, rich values over a real MessagePort, unsupported encodings, context-free synchronous adapters, immutable historical schemas, retained execution/retry provenance, hash inputs, refusal rollback, snapshot/live reconciliation, and telemetry failure isolation.
- All 73 system-worker Workerd tests pass across 21 files, including durable cold-start recovery, publication, capabilities, and telemetry.
- Sync end-to-end tests pass: four Workerd tests and four browser tests.
- Affected lint tasks pass with no errors. Twelve pre-existing React warnings remain (explicit `any` in session/query typing and a JSX-free `.tsx` typecheck file); this implementation adds no remaining warnings.
- Changed-file formatting and `git diff --check` pass.

## Relationship to Spec 001

1. This extends Spec 001's retained execution-guard refusal and execution-service design. Guard and program failures use the same version-owned business union; external inability to evaluate remains outside that union.
2. Preserve unrelated Shopping behavior and the deferred retry-policy and historical verification backlogs.
