---
title: SystemRepo spec locks and validation before production promotion
updated: 2026-09-10
---

# Plan 078 — SystemRepo spec locks and validation before production promotion

**Status:** Implemented and verified. Disposable Cloudflare split, promotion, full CLI deployment, and real signal-interruption smoke tests passed.

## Summary

Lock aggregate and service definitions in SystemRepo. Validate every Repo activation before provisioning, and check each development reload automatically.

For production, upload the candidate, stage it at **0% alongside the incumbent at 100%**, validate through a local Worker using a remote service binding, then promote the candidate. No production URL input or additional deployed proxy Worker.

Both commands call **`SystemApi.checkSystemSpec()` with no domain arguments**. That method serializes its own executing Worker's authored system and calls **`SystemRepo.checkSystemSpec({ spec })`**. The CLI supplies no candidate spec. Keep the existing RPC request envelope with an empty argument tuple.

## 1. Spec acceptance and Repo activation

1. Add immutable aggregate and service lock tables to SystemRepo. The logical identity is `{ systemId, kind, name, version }`: the authenticated/configured system selects SystemRepo; candidate definitions supply kind, name, and version.
2. Add `SystemApi.checkSystemSpec()` and the corresponding `SystemRepo.checkSystemSpec({ spec })` RPC, using existing request/result conventions and same-named Effect procedures. The public method serializes and validates the executing bundle through the existing spec-generation path. SystemRepo compares all candidate aggregates and services atomically, inserting new versions only when every existing definition matches.
3. Preserve locks when definitions disappear. Identical reintroduction succeeds; modifying a locked version fails. Compare existing serialized definitions structurally, ignoring object-key order and preserving array order.
4. Extend `registerRepo` to combine registration with requesting the accepted definitions. Require existing matching locks before recording registration; registration never creates locks. Apply the same rule to the bulk registration path.
5. Move that call before common Repo provisioning, bootstrap, and activation subscriptions. Run it on cold activation in development and production, including alarm-driven activation. SystemRepo remains exempt from registering with itself. Synchronous schema/configuration construction does not authorize provisioning or durable mutations before the guard succeeds.
6. Registration means "known instance with accepted definitions"; retain it if subsequent initialization fails. Replace VAR's `head.originalSpec` checks with the common guard while preserving execution-head initialization.
7. Lock the existing aggregate/service serialization. Executable bodies, root authentication definitions, and framework-owned physical schema changes remain outside this comparison.
8. Keep candidate serialization in the calling Worker. During production preflight, the HTTP entrypoint runs B while SystemRepo remains assigned to A; deriving the candidate inside SystemRepo would incorrectly inspect A. Acceptance and spec inspection must remain callable before child Repos are accepted, and telemetry failure must not replace their domain results.

## 2. Development and production commands

1. Replace the dev subprocess with project-resolved Wrangler's programmatic development environment. Register reload listeners before startup; on initial load and each completed reload, call `SystemApi.checkSystemSpec()`. This locks definitions on the first accepted dev load, even if no child Repo exists. A rejected spec disposes Wrangler and exits the command with status 1. Preserve current configuration, persistence, port, and scoped cleanup behavior.
2. For production redeployment, read the current deployment through Wrangler's JSON output. Require one incumbent at 100%; reject an existing split rollout rather than replacing it.
3. Upload candidate B, retaining its returned version ID. Stage incumbent A at 100% and B at 0%. Cloudflare requires a version to belong to the active deployment before an override can select it. [Version override requirements](https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/).
4. Start a temporary local forwarding Worker with a remote service binding to the configured production Worker name. Reuse the existing Cap'n Web HTTP client against its loopback URL. Wrangler handles account authentication and remote routing. Use a distinct temporary local Worker name and scoped temporary configuration; deploy no additional application Worker. [Remote service bindings](https://developers.cloudflare.com/workers/local-development/#using-remote-resources-with-durable-objects-and-workflows).
5. The forwarding Worker attaches B's HTTP version override. Add a version metadata binding and response header to ProductionWorker; reject missing or unexpected version IDs before trusting RPC results. Use bounded retries for deployment propagation. Preserve the normal request body and authentication through the existing HTTP transport; do not introduce a custom Cap'n Web protocol implementation.
6. Call B's `SystemApi.checkSystemSpec()`. B serializes its own spec and submits it to SystemRepo for atomic acceptance. Only after a verified response from B succeeds, promote **that same version ID** to 100%. Then await existing initialization/readiness through the service binding. The CLI neither generates nor sends the candidate spec.
7. Remove preview-URL parsing and assumptions. Deployment results report Worker name and deployed version ID instead of constructing a production URL.

## 3. Failure and bootstrap behavior

1. A failed check prevents promotion and restores A alone at 100%, provided the active deployment still matches this command's staged deployment. Report cleanup failures separately; never overwrite a detected intervening deployment.
2. Dispose local forwarding processes, RPC sessions, and temporary files on success, failure, or interruption. If interrupted staging survives cleanup, leave a concrete recovery command.
3. Successful acceptance permanently retains new locks even if promotion later fails. Retrying identical definitions succeeds.
4. A genuinely new system has no incumbent: deploy the guarded initial Worker, call its `SystemApi.checkSystemSpec()`, then initialize children. Missing authorization, unavailable APIs, or old incompatible state must not be interpreted as a new system.
5. This is a hard cutover requiring fresh affected storage. Do not adopt existing databases from current code or delete shared/production state automatically. Ordinary staged releases must preserve DO class exports; Cloudflare class lifecycle changes need a separate deployment procedure. [DO deployment constraints](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/with-durable-objects/).
6. Uploading or staging code does not itself establish spec acceptance. Retain the common activation guard in both environments; do not replace it with HTTP traffic gating or an alarm-cancellation sweep.

## 4. Verification

1. Test atomic acceptance, aggregate and service conflicts, concurrent first acceptance, additions, removal/reintroduction, and structural comparison.
2. Verify that `SystemApi.checkSystemSpec()` accepts an empty argument tuple, derives the spec from its own executing bundle, and forwards that spec to SystemRepo. Exercise B's entrypoint against an A-assigned SystemRepo to prove that A's imported definitions are not substituted for B's candidate.
3. Verify mismatched or unlocked activation creates no Repo schema, bootstrap marker, subscriptions, or registration. Cover fresh objects, cold restarts, alarms, and failed-bootstrap retries.
4. Exercise real Wrangler reloads: initial acceptance, compatible reload, incompatible reload, nonzero command exit, and complete process cleanup.
5. Test deployment ordering, silent override fallback, propagation retries, failed acceptance, interrupted staging, retained locks after promotion failure, and initial-system bootstrap.
6. Verify the platform-dependent combination in a disposable Cloudflare smoke test before treating the workflow as proven: candidate HTTP executes B while SystemRepo and a scheduled alarm remain on A at the 100%/0% split. Verify both a matching spec and a conflicting spec before testing promotion. The documented per-object assignment model supports this expectation, but the combined path is not yet live-verified. [DO version assignment](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/with-durable-objects/).
7. Run relevant Nx type, lint, CLI, and system-worker tests. Update activation, authored-system, API, and deployment documentation with the implementation, including the superseded guidance that excludes spec acceptance from SystemRepo's responsibilities.

## Implementation and verification record

1. SystemRepo owns immutable `aggregateSpecLocks` and `serviceSpecLocks`. `SystemApi.checkSystemSpec()` validates an empty argument tuple, serializes its executing bundle, and delegates atomic acceptance. The result reports `{ workerVersionId: string | null }` from SystemRepo's executing bundle. Both acceptance and spec inspection skip child telemetry persistence.
2. Common Repo activation validates and registers the complete executing spec before any Repo storage access, provisioning, bootstrap marker, or subscription. Registration survives later initialization failure. VAR's obsolete `head.originalSpec` column and checks are removed; execution-head initialization remains. This requires fresh affected storage; no shared state was reset.
3. Development uses project-resolved Wrangler's programmatic environment and checks every initial/completed reload. Real Wrangler verification covered an unchanged serialized definition, a conflicting aggregate payload, exit status 1, closed loopback listener, removed generated files, retained original locks, and no child registrations. The built Ink CLI was also exercised.
4. Live testing established three necessary implementation details: `versions upload` cannot create a Worker, so a genuinely new system uses guarded `wrangler deploy`; forcing `dev.remote: false` disables even explicitly remote service bindings, so the local forwarder omits that option; HTTP batch sessions are single-use and each RPC owns a separate scoped session.
5. The disposable platform smoke used Worker `zerospin-plan078-smoke-123033c4be4b`: incumbent A `16c564a0-602d-4b6b-9ac5-76bb66113d5f`, matching B `0fe699dd-ac9c-4525-992c-3a83e1c9b1c5`, and conflicting C `d6606234-89db-4b66-af0d-db6cd79057f8`. At A100/B0, the attested HTTP entrypoint executed B while SystemRepo and its scheduled alarm executed A; matching acceptance succeeded. At A100/C0, attested C reached A and the conflicting definition was rejected. Promotion deployment `23924951-82f1-43db-8ae6-508dcf414474` selected B100.
6. The same smoke observed SystemRepo remain on A for 52 post-promotion polls (about one minute) before switching to B. The CLI therefore requires the new check result's `workerVersionId` to equal B before existing initialization, with 120 attempts and a 180-second deadline. A timeout leaves the promoted deployment intact and does not initialize against A. This uses the new check result, without another RPC or moving initialization between runtimes.
7. A full production CLI smoke used disposable Worker `zerospin-plan078-cli-75d3e0da0cd9`. Initial version `98d82346-ce2c-434c-a1ff-c5503a60519b` was accepted and initialized. Candidate `8582eff5-9578-4c9c-a48a-046a5580cea5` added a service, passed staged preflight, promoted, waited for SystemRepo assignment, and initialized. A changed locked aggregate payload then failed with `aggregate-spec-mismatch`; cleanup restored the incumbent alone at 100% in deployment `c50a4aa2-b51e-4386-92e6-aa7646ee25e6`. Both disposable Workers and their forwarding environments were removed after verification.
8. Real staged-production interruption was verified against disposable Worker `zerospin-plan078-signal-ed62368ecd5d`: SIGTERM interrupted candidate `91d9b055-6289-49dd-ba2e-ee0fd25a1ca6`, restored incumbent `721c5b5e-e184-46e9-9999-060f692f7d0e` alone at 100% (deployment `2e89c084-d21f-4fd7-bdeb-561ebf6e67c2`), disposed forwarding sessions/files, and exited 1 normally. The fixture then deleted the Worker. Both CLI paths retain asynchronous signal ownership while suppressing only newly installed Miniflare immediate-exit hooks; preexisting/other listeners and ordinary exit cleanup remain intact.
9. Final Nx verification passed: system-worker Node tests (190), system-worker workerd tests (55), CLI tests (61, including real Wrangler), production-worker workerd tests (2), system-worker and CLI type checks with dependency builds, and lint for CLI/system-worker/production-worker. Changed-file formatting, source-link/sequence-number validation, and `git diff --check` passed. The activation, API, authored-system/deployment docs and AGENTS guidance were updated in the same pass.
