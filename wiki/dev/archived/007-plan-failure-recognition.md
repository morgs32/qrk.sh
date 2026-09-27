# Failure recognition without version adapters

**Date:** 2026-09-23  
**Status:** Archived at the maintainer’s request on 2026-09-23; implementation present, acceptance verification deferred.

## Archive checkpoint — 2026-09-23

1. The current source contains receiver-side recognition, private recognition metadata, original-envelope serialization, matcher exports, and migrated delivery/recovery paths. The source scan found no remaining `failureUp`, `failureDown`, or `failureView` references in package TypeScript implementation files.
2. Archived at the maintainer's request with broader acceptance verification outstanding. The recorded historical blockers below have not been rerun and are not asserted to remain current. Remaining checks are recorded in [TODOS.md](../../../TODOS.md#plans-005006007--deferred-acceptance-verification).

This checkpoint supersedes earlier instructions to keep the plan active until verification passes. Historical implementation and verification notes below are retained as recorded.

## Dependency and implementation order

1. Build on the inline failure records and injected constructors being implemented in [Migrate one Shopping caller](codex://threads/01a0ced9-d5c3-7160-8bac-0a413380d36d). That task owns the authoring migration: camelCase `failures` records, constructor injection, derived union codecs, duplicate-code validation, and null-default scoped factories.
2. Its migration is in progress, not verified complete. The checkout already contains `IFailures`, `FailureType`, `FailureJson`, and `getFailuresCodec`; re-read their completed implementation before changing shared contract/error modules. Do not duplicate or revert that work.
3. This plan replaces the earlier conversational failure-recognition plan. No spec 007 was written before this plan; retain this document as the implementation source of truth.
4. Complete the authoring migration first, then implement recognition and remove adapters. The other task's instructions to retain adapters, inject destination constructors into adapters, and require adapters when codec identities change describe its intermediate behavior. This plan deliberately supersedes those requirements. Preserve its record inheritance and codec reuse as authoring behavior, without making codec identity a delivery gate.

## Intended behavior

1. Preserve the authoritative failure and its original contract-version provenance. A recipient recognizes the failure using its bound contract's `failures` record; it does not translate the failure through contract versions.
2. Expose successfully decoded failures with typed payloads. Expose unfamiliar failures as general `ZerospinError` values with `extra: unknown`, preserving original public fields, including `code`, `scope`, and encoded `extra`.
3. Reconcile valid rejections regardless of recognition: remove invalid optimism, settle pending commands, and advance the applicable cursors. An unfamiliar explanation must not cause retries or prevent acknowledgement.
4. Keep producer-side declaration and scope validation. Malformed envelopes, undeclared producer failures, infrastructure failures, defects, and interruptions retain their separate treatment.

## Authoring and public API

1. Retain inline camelCase records, injected constructors, named guard/program callbacks, and existing scope restrictions. Use the migration's derived codec and inference utilities; do not reintroduce singular authored `failure` schemas, standalone error constants, or authored unions.
2. Keep individual result values named `failure`. Authoring keys such as `insufficientFunds` are distinct from wire codes such as `insufficient-funds`. Recognition checks the schema's scope, code, and payload; matcher keys are wire codes, never record keys.
3. Preserve null-default construction for all scoped factories. `.make()`, `.make({})`, and supported overrides continue producing `extra: null`; custom-extra schemas retain their required typed input. `extra: unknown` applies to the general exposed error, not to the typed constructors. Wire decoding still requires explicit encoded fields.
4. Provide `matchZerospinErrorCode` through the error package and applicable SDK exports:

   ```ts
   matchZerospinErrorCode({
     failure,
     onMatch: {
       'insufficient-funds': error =>
         showMissingAmount(error.extra.missingAmount),
     },
     onUnknown: error => showGenericRejection(error.message),
   });
   ```

5. Infer allowed handler keys and callback argument types from the known failure union carried by `failure`, derived from the receiving record. Handlers are optional; `onUnknown` is required. Unrecognized failures and recognized failures without a supplied handler reach `onUnknown` with general `ZerospinError` and `extra: unknown`. Infer the union of callback return types, return the selected callback's result, and propagate callback exceptions.
6. Carry validated recognition internally through nonserialized symbol metadata, including the known failure type for inference. Do not add a public wrapper, recognition flag, `UnknownError`, or replacement code. Matching only the code string is insufficient: a familiar code with an unfamiliar payload must reach `onUnknown`.

## Implementation

1. Validate the general public error envelope before attempting recognition. Serialized payloads remain JSON-valid even though the exposed fallback `extra` type is `unknown`. Preserve existing diagnostic redaction; do not route scoped payloads through framework-only processing that changes their contents.
2. Decode original encoded business failures against `getFailuresCodec` for the receiving contract's record. An empty record or schema mismatch produces the general error; successful decoding produces the declared runtime error, including rich extra values. Do not decode with a historical producer codec as a prerequisite for recipient recognition, and do not require the recipient to possess the producer's version lineage.
3. Preserve original retained bytes and provenance for history and hashes. Recognition affects only the runtime view. Reconstruct recognition after RPC, worker messaging, live delivery, snapshots, and offline recovery, using the receiving runtime's schemas. Never serialize or trust incoming recognition metadata.
4. Apply the same recognition behavior before exposing public command failures, including local staging and validation results. Keep producer construction/validation and recipient recognition distinct; constructing a typed error does not prove recognition by a different receiver.
5. Remove `failureUp`, `failureDown`, adapter types, destination-constructor adapter injection, and recipient adaptation traversal. Keep payload upgrade mechanisms and historical producer declarations needed for their existing independent purposes.
6. Remove adapted `failureView` fields from delivery, schemas, SQL shapes, journal conversions, snapshots, types, and DevTools. Use the original retained failure for recognition and reconciliation. Remove missing-view and missing-adapter reconciliation gates; retain malformed-envelope checks.
7. Migrate affected callers, type proofs, tests, and docs together. Update Spec 002 and architecture descriptions that currently require adaptation. Preserve the other task's authoring documentation and open plan 005 acceptance gates; do not mark its unrelated work complete.

## Verification

1. Extend the existing failure-codec seam for known, unfamiliar, same-code/different-extra, wrong-scope, empty-record, inherited-record, and redeclared-record cases. Equivalent recipient schemas may recognize failures despite different codec identities. Removed or added failure members must not block valid delivery.
2. Verify matcher inference: wire-code autocomplete, exact typed extras, invalid handler keys rejected, optional handlers, required fallback, fallback extra remaining `unknown`, and inferred return types. Verify unmatched dispatch and exception propagation at runtime.
3. Test null-default errors alongside custom rich extras. Known rich payloads decode correctly; unfamiliar payloads preserve encoded values. Original retained history and hashes remain unchanged by recognition.
4. Test serialization boundaries: metadata is absent from wire/persisted data and rebuilt locally. A familiar code with an invalid recipient payload cannot invoke its typed handler, including after RPC and replay.
5. Extend command-reconciliation tests for live commands, snapshots, and persisted recovery. Unfamiliar valid refusals must clear pending optimism and advance reconciliation normally; malformed envelopes must still fail validation.
6. Replace adapter-specific tests with recognition tests. Preserve producer validation, wrong-scope, undeclared failure, duplicate-code, record injection, null-default, guard-order, and Shopping retry/no-op coverage from the dependency migration.
7. Run affected Nx typechecks and relevant Node/Workerd suites, scoped lint/format checks, and diff checks against the completed shared checkout. Report unrelated failures separately and do not broaden this work to repair them.

## Boundaries and rollout

1. No new failure registry, independently versioned failure identities, changes to guard placement, or changes to execution semantics.
2. Hard-cut superseded APIs and storage fields without aliases, dual paths, translation migrations, or compatibility-only tests. Changed fixed storage requires empty storage; do not reset application storage automatically.
3. The inline-record migration keeps retained envelopes unchanged. This follow-up preserves their authoritative contents while removing the redundant adapted view. Do not attribute this follow-up's storage changes to the other task.
4. Preserve unrelated work. Keep this plan active until implementation and verification are complete.

## Implementation checkpoint — 2026-09-23

1. Implemented against the completed inline-record API. Removed adapter authoring/runtime paths and persisted adapted views. Retained original provenance and bytes; consuming runtimes recognize against their own record without producer lineage.
2. Added the matcher to error and SDK exports. Recognition uses a private symbol on a local error instance, carries the known union for inference, and retains the original public envelope for serialization. Typed handlers receive validated decoded errors; the fallback receives general errors with unknown extra.
3. Updated local staging and validation, RPC envelope delivery, WebSocket live/replay, snapshots, journals, DevTools fields, and affected architecture documentation. No application storage was reset.
4. Passed focused tests: error package 31, Core codecs/reconciliation/local journals 21, server delivery/admission 12, receiver rich-value recognition 1, and Workerd prepared execution 2 (67 total). Tests cover wrong scope, changed payload under the same code, empty records, rich extras, handler typing, fallback dispatch, original serialization, and persisted recovery. Scoped lint, formatting, and diff checks pass.
5. Core, error, and system-worker Nx typechecks pass. Consumer production builds complete, but the broader typecheck run finds session tests reading `cause` from a JSON-error union and Shopping checkout fixtures with plain string IDs where prefixed IDs are required. These are outside this change.
6. The full SDK test run reaches the new matcher export but fails its pre-existing server-export inventory for six actor APIs. The wider execution-guard suite has three failures in actor/repo-key fixture setup; its receiver-recognition test passes. These broader acceptance failures remain open and were not repaired here.
7. Keep this plan active until the unrelated acceptance blockers are resolved and the broader checks pass. Original authoring migration and plan 005 acceptance gates remain separately owned.
