# DevTools Manual Push Trace Design

**Date:** 2026-07-12
**Status:** Approved for planning

## Problem Statement

The session DevTools exposes push pausing and local telemetry, but its manual push action is hidden in the Commands staged-count badge and does not link the operator to the trace created by that attempt. The imperative session push boundary also discards the decoded FrontendRepo admission result, so callers cannot observe completion after local rebase.

## Solution

Move manual push into the session toolbar beside `Pause push`. Run only button-triggered pushes under a manual root span, retain a nullable pointer to that attempt in session state, and link the operator directly to that trace in Logs. Preserve automatic pushing as a separate path that never updates the manual pointer.

## User Stories

1. As a DevTools operator, I want a visible Push button beside Pause push so that I can deliberately flush staged commands while automatic push remains paused.
2. As a DevTools operator, I want the toolbar to show when the latest manual attempt completed and whether it rejected so that I have immediate inline feedback.
3. As a DevTools operator, I want that feedback to link to the exact browser trace so that I can inspect the push, its Frontend API link, and any failure.
4. As a session caller, I want manual push to resolve with the decoded admission result only after local rebase so that Promise settlement represents the complete local operation.
5. As a DevTools operator, I want clearing Logs to remove the manual trace pointer too so that the toolbar cannot retain a dead link.

## Implementation Decisions

1. `ISession.pushStagedCommands` returns a Promise of the exact decoded `FrontendApi.pushCommands` result: `pendingCommands`, `pushedCommands`, and `failedCommands`.
2. The Promise resolves only after response rebasing succeeds and rejects on request or rebase failure.
3. With no staged rows, the frontend program skips the RPC and resolves with stable empty arrays for all three result partitions.
4. Session state adds an inline nullable `lastDevtoolsPush` shape containing `traceId`, `completedAt`, and `status: "ok" | "error"`. No named type, export, SQLite column, or telemetry scan is added.
5. The toolbar always renders Pause push and Push. Push is enabled only while push is paused, staged rows exist, and no manual attempt is in flight. Its in-flight label is `Pushing…`.
6. The manual React session boundary runs under `devtools.pushStagedCommands`, reads that current trace id directly, and updates `lastDevtoolsPush` on both Effect exits without changing the returned result or rejection.
7. A resolved attempt stores `ok`, including command-level admission failures returned normally. A rejected request or rebase stores `error`.
8. The link text is `Pushed at <local time>` or `Push failed at <local time>`, includes milliseconds, and exposes the complete ISO timestamp as its title.
9. The link targets `logs?traceId=<traceId>`. Logs selects a valid requested trace, otherwise falls back to the newest trace; selecting another row updates the query parameter.
10. Clearing Logs clears session telemetry, `lastDevtoolsPush`, and the trace query parameter together.
11. The Commands sidebar retains the staged count but removes its manual-push glyph.
12. Automatic queue pushes retain their current execution path, ignore the returned result, and never update `lastDevtoolsPush`.

## Testing Decisions

1. Extend the existing real-session DevTools integration seam to click Push, observe single-flight state, follow the stored trace link, select the exact trace, and clear both telemetry and the pointer.
2. Cover rejected manual pushes and the `Push failed at` link at the DevTools/session seam.
3. Cover exact response forwarding, post-rebase resolution, the stable empty result, and rejection in frontend tests.
4. Cover Promise results, success/error trace pointers, and automatic-push isolation in React push-queue tests.
5. Cover valid, absent, and stale `traceId` parameters plus clearing in Logs route tests.
6. Verify affected core, frontend, React, DevTools, and shopping test and TypeScript targets through Nx only.

## Out of Scope

1. No shopping Playwright scenario is added.
2. No admission-count summary or toast-only feedback is added.
3. No automatic-push trace link is retained.
4. No DevTools push control is added outside the session toolbar.
5. No trace pointer is persisted outside the session store.

## Further Notes

1. Other sessions remain unaffected because telemetry and `lastDevtoolsPush` are session-owned.
2. The manual trace pointer identifies an attempt, while command-level admission outcomes remain in the returned push response and trace details.
