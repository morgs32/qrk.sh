# Handoff: Standalone session

> Archived 2026-09-20: superseded by [Spec 086](../specs/086-spec-standalone-sessions-and-test-organization.md). Remaining work is consolidated there; archival does not mean implementation is complete.

**Date:** 2026-09-20
**Focus:** Finish the `makeStandaloneSession` design spec against the current uncommitted Zerospin implementation before implementation or QRK integration continues.

## Goal

Finish the interrupted `$spec` workflow for a durable, aggregate-only browser
session that never contacts a backend. Begin by rereading the current worktree:
the implementation changed while it was being audited, including replacing the
document-global backup singleton with the runtime-owned
`BrowserBackup/BrowserBackup.ts` Layer.

QRK's worktree was clean at the audit point and still consumed the older
vendored `makeMockSession` integration. Do not edit QRK's `vendor/zerospin`
subtree directly.

## Done

1. Audited the uncommitted `makeStandaloneSession`, standalone backup-key,
   shared browser-backup, aggregate-session, journal, and DevTools changes in
   the Zerospin source checkout.
2. Confirmed that the WIP already provides aggregate-only construction,
   IndexedDB backup through the SharedWorker, restore-over-seed behavior, no
   backend delivery callback, synchronous command staging, and DevTools
   registration without push controls.
3. Confirmed these design decisions with the user:
   1. Standalone sessions are aggregate-only, browser-persistent, and never
      contact a backend.
   2. Keep the WIP's caller-supplied `key` and public `reset()` interface.
   3. Persisted data wins over constructor resources; resources seed a new or
      reset document.
   4. Reopening a key with different encoded authentication fails without
      modifying the backup.
   5. A terminal backup failure fails the session closed while retaining
      readable data.
   6. A revoked session becomes superseded and reacquires using the live-session
      visibility, focus, and `pageshow` lifecycle.
   7. React receives a dedicated `useInitializeStandaloneSession` hook.
   8. Standalone sessions register in DevTools without push controls.
   9. Cross-refresh durability is represented by `backupState: "ready"`, not
      synchronous command success.
4. At the audited snapshot, the relevant Zerospin projects passed
   `tsc:typecheck`; React lint completed with warnings and no errors;
   `git diff --check` passed. These results predate subsequent worktree changes
   and must not be treated as verification of the eventual implementation.
5. Confirmed that no standalone-specific tests or consumer integration existed
   at the audited snapshot.

## Remaining

1. Reread `git status`, the complete current diffs, and all current standalone
   files before relying on this audit. Preserve unrelated WIP.
2. Finish the `$spec` grill one decision at a time, including the open decisions
   below, then confirm the chosen test seams with the user.
3. Write exactly one design spec under `wiki/dev/specs/` only after shared
   understanding is confirmed. Allocate its prefix from the then-current
   planning tree; do not assume this handoff's `084` is available for the
   spec/plan pair.
4. Ensure the completed design covers takeover and backup-worker-disconnect
   recovery, including interruption during acquisition and recovery after a
   previously current session is revoked.
5. Ensure terminal backup failure transitions the session to failed and rejects
   subsequent staging while leaving the last in-memory data readable.
6. Validate encoded authentication against persisted authentication before
   publishing a restored session. A mismatch must leave the backup untouched
   and require explicit `reset()` before replacement.
7. Add the dedicated standalone React initializer and define its ownership,
   initialization-error, and disposal behavior.
8. Specify and later add focused module tests plus the minimum browser-level
   lifecycle seam needed to cover persistence, reset, takeover, worker loss,
   backup failure, authentication mismatch, and DevTools registration.
9. Defer QRK vendor synchronization and replacement of
   `createLibraryMockSession` until the standalone spec is settled and the
   upstream implementation is complete and verified.

## Suggested skills

1. `$spec` — continue the interrupted one-question-at-a-time grill, confirm the
   test seams, and write the single design spec.
2. `$codebase-design` — keep the standalone session a deep module whose small
   interface hides backup ownership, recovery, and persistence mechanics.
3. `$patterns` — apply the repository's Effect, lifecycle, testing, YAGNI, and
   coordination-cost guidance without extending scope beyond the current QRK
   caller.
4. `$nx-workspace` — inspect the resolved Zerospin project targets before
   choosing verification commands.
5. `$nx-run-tasks` — run the selected typecheck, lint, and test targets through
   Nx after implementation.

## Pointers

1. `packages/react/src/makeStandaloneSession/makeStandaloneSession.ts`
2. `packages/react/src/BrowserBackup/BrowserBackup.ts`
3. `packages/frontend/src/makeStandaloneFrontendBackupKey.ts`
4. `packages/core/src/session/executeCommandTx.ts`
5. `packages/core/src/session/stageCommand.ts`
6. `/Users/morgs32/Downloads/cursor_mock_session_integration.md`
7. `/Users/morgs32/GitHub/qrk.sh/apps/library/makeLibraryFrontend/createLibraryMockSession.ts`

## Open decisions

The next agent must not infer these answers from the current WIP.

1. **Successful local command representation.** The interrupted question offered
   three choices:
   1. Settled local history retaining the complete occurrence and inverse
      mutations, with no active optimistic row. This was the recommendation.
   2. Permanent unresolved optimism through the live-session journal shape.
   3. Persisted resource results without command history or inverse mutations.
2. **Test seam.** Confirm whether the minimum sufficient surface is focused core
   journal tests plus browser-level IndexedDB/SharedWorker lifecycle tests, or
   whether an existing higher seam can prove all required behavior with less
   exposed implementation.
3. **Synthetic `systemId`.** Confirm whether the runtime-generated value remains
   an internal implementation detail or becomes part of the documented
   standalone session-state contract. The audited WIP used `null` before
   initialization and a fresh synthetic ID while initialized.
4. **Reset inputs.** Confirm whether `reset()` always replaces the document using
   the constructor's original resources and authentication, as the audited WIP
   did.
5. **QRK migration name.** Confirm whether the eventual QRK migration renames
   `createLibraryMockSession` to reflect standalone durability or preserves the
   existing consumer-facing name while changing its implementation.
