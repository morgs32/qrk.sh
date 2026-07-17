# LogRepo binding RPC types design

**Date:** 2026-07-12
**Status:** Approved for planning

## Problem Statement

`LogAgent` reads recent system log rows directly from its `LOG_REPO` Durable Object binding, matching the intended system-scoped logging topology. The concrete `LogRepo` class exposes `getLogRows`, but a downstream Shopping production build sees `LOG_REPO.getByName(...)` as a `DurableObjectStub<LogRepo>` without that method. System-worker declaration output and generated Wrangler binding declarations therefore disagree at a consumer boundary, blocking an otherwise successful Shopping compilation.

The failure must not be hidden with another assertion, a local wrapper, or a new hop through `SystemWorker`. The direct `LogAgent` to `LogRepo` boundary is intentional and already exercised at runtime.

## Solution

Make the concrete `LogRepo` RPC surface survive the worker entrypoint export and generated Cloudflare binding type path used by downstream applications. `LogAgent` continues resolving the system-scoped `LOG_REPO` stub by name and invoking `getLogRows` directly. The repair belongs at the binding, exported class, or declaration-generation boundary that currently erases the method.

## User Stories

1. As a developer building a standalone Zerospin application, I want the generated `LOG_REPO` binding to expose the real `LogRepo` RPC surface, so that application typechecking agrees with the deployed Durable Object.
2. As an operator opening live logs, I want `LogAgent` to send recent `LogRepo` rows immediately on WebSocket connection, so that live-tail state starts from persisted history.
3. As a system-worker maintainer, I want Durable Object method typing fixed at the owning export boundary, so that other consumers do not need assertions or alternate RPC paths.
4. As a Shopping maintainer, I want the production build to typecheck through its generated Worker bindings, so that unrelated DevTools work is not blocked by stale or erased Durable Object methods.

## Implementation Decisions

1. Preserve the direct `LogAgent` to `LOG_REPO` call. Do not reroute recent-row reads through `SystemWorker`.
2. Preserve `LogRepo.getLogRows` as the public Durable Object RPC method delegating to its same-named Effect.
3. Correct the first declaration or generated-binding boundary that erases `getLogRows`; do not add a consumer-side wrapper or bolt-on interface.
4. Do not add an `ALLOWED_CAST` marker or another assertion in `LogAgent`.
5. Keep `LogRepo` system-scoped and continue using the `LogAgent` Durable Object name as the `LogRepo` lookup name.
6. Keep the existing encoded RPC result and `decodeRpc` behavior unchanged.
7. Regenerate checked-in Wrangler declarations only when the owning configuration or exported class identity requires it; keep the bindings-only environment mirror synchronized if generated declarations change.

## Testing Decisions

1. Use system-worker TypeScript verification as the lowest seam proving `LOG_REPO.getByName(...).getLogRows(...)` is available without a new assertion.
2. Keep the existing `LogAgent` workerd suite as the runtime seam proving initial history and pushed state still reach WebSocket clients.
3. Use the Shopping production build as the highest consumer seam proving its generated Worker binding resolves the complete `LogRepo` RPC surface.
4. Run the relevant system-worker library, TypeScript, lint, and workerd targets through Nx before declaring the change complete.
5. Do not weaken or bypass generated Worker types in the Shopping application to make the build pass.

## Out of Scope

1. Changing log retention, row schemas, telemetry storage, or WebSocket message shapes.
2. Moving log reads behind `SystemWorker` or another gateway.
3. Adding a new logging service, wrapper, adapter, or compatibility path.
4. Refactoring other Durable Object binding types without evidence that they share the same erasure failure.
5. Addressing the Shopping seed-date decoding failure.

## Further Notes

1. Current source and emitted system-worker declarations both contain `LogRepo.getLogRows`; the follow-up should trace why the downstream `DurableObjectNamespace` consumer still loses that method instead of assuming the class implementation is missing.
2. The architecture already describes `LogAgent` as reading persisted `LogRepo` rows directly before broadcasting live updates; this spec preserves that topology.
