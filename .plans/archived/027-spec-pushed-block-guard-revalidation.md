# Pushed-block guard revalidation design

**Date:** 2026-07-15
**Status:** Approved for planning

## Problem Statement

FrontendRepo runs each frontend command's guards before admitting the command into its optimistic projection. AccountRepo later receives the immutable pushed block and authoritatively finalizes those commands. Repeating the same guards at AccountRepo is unnecessary when AccountRepo is still at the exact authoritative account frontier represented by FrontendRepo during admission, but blindly trusting the earlier decision is unsafe after AccountRepo has advanced.

The pushed block currently does not preserve the authoritative account frontier used for admission. AccountRepo therefore cannot distinguish an admission decision made against its current state from one made against stale FrontendRepo state.

## Solution

Each immutable pushed block records FrontendRepo's nullable `lastAccountCursor` as `admissionLastAccountCursor`. AccountRepo completes any required ServiceBlock alignment, then compares its resulting current `lastAccountCursor` with that admission cursor once for the whole pushed block.

When the cursors are equal, AccountRepo trusts every frontend guard result already established while FrontendRepo admitted the block. When they differ, AccountRepo reruns every command's original frontend guards sequentially against the current authoritative AccountRepo transaction before applying that command's authoritative mutations. Guard failure becomes that command's authoritative failed outcome without aborting later siblings.

## User Stories

1. As FrontendRepo, I want each pushed block to preserve the authoritative account frontier used during admission so that AccountRepo can determine whether the guard result is still current.
2. As AccountRepo, I want to trust previously successful guards when my authoritative frontier exactly matches the admission frontier so that I do not repeat equivalent validation.
3. As AccountRepo, I want to rerun guards after my authoritative frontier advances so that stale optimistic admission cannot authorize a command against newer state.
4. As AccountRepo, I want rerun guards processed in pushed-command order so that each later command observes authoritative mutations committed by successful earlier siblings.
5. As AccountRepo, I want one failed rerun guard to produce one immutable failed command outcome while later siblings continue through their own savepoints.
6. As AccountRepo, I want duplicate delivery of an already-finalized pushed block to return its original outcome so that later account advancement cannot change a retry result.
7. As an operator, I want stale local persisted pushed blocks removed instead of supported through a compatibility path so that the new watermark invariant remains required and explicit.

## Implementation Decisions

1. Extend the existing pushed-block shape with required `admissionLastAccountCursor: IAccountCursor | null`. Do not introduce a second pushed-block type or a separate admission-watermark wrapper.
2. `null` is the canonical initial account frontier. A FrontendRepo whose authoritative projection has never received an AccountBlock writes `admissionLastAccountCursor: null`; AccountRepo at the same initial frontier treats `null` equality as an exact match.
3. FrontendRepo reads its repo-local authoritative `lastAccountCursor` while constructing the immutable pushed block and persists that value inside the encoded pushed-block outbox payload. All commands admitted by that FrontendRepo transaction share the block-level cursor.
4. The cursor certifies only prior frontend guard evaluation. It does not bypass frontend-to-account adaptation, account-contract mutation preparation, replication preparation, ServiceBlock alignment, authoritative mutation application, account cursor/index assignment, or account-block publication.
5. `AccountRepo.finalizePushedCommands` keeps pushed-block-id idempotency first. If an account outbox row already exists for the pushed-block id, it returns the stored outcome before comparing cursors or executing guards.
6. For a new pushed block, AccountRepo retains the existing grouped preparation and ServiceBlock alignment behavior. Relevant ServiceBlocks may produce commandless AccountBlocks and advance the account frontier before pushed commands are finalized.
7. AccountRepo chooses one guard mode for the entire block after all retained ServiceBlock alignment has been applied and immediately before processing pushed commands. It compares the transaction's resulting current `lastAccountCursor` with `pushedBlock.admissionLastAccountCursor`.
8. Exact cursor equality selects trusted mode. Trusted mode does not execute frontend guards again for any command in the block, including later siblings after earlier commands advance AccountRepo within that same block.
9. Cursor inequality selects revalidation mode. AccountRepo cannot and need not order opaque account cursors; every unequal value means the prior guard result is not certified for the current frontier.
10. Revalidation mode resolves the command's original frontend binding and contract, decodes and validates the original frontend payload, and runs the exact existing `FrontendController` guards with the original actor id and the current AccountRepo savepoint transaction. Do not introduce AccountRepo-specific guards or copy guard programs.
11. Revalidation runs inside each command's existing savepoint before authoritative command mutations are applied. Commands remain sequential, so a later guard observes authoritative state committed by successful earlier siblings; it does not observe mutations from failed siblings.
12. A rerun guard failure wins that command's finalization attempt, preserves the guard's original serialized error, and produces a full authoritative failed pushed-command outcome with its assigned account cursor/index. It applies no command mutations and does not abort later commands.
13. ServiceBlock alignment is independent authoritative synchronization. Any commandless AccountBlocks and subscription-watermark advancement completed before a guard failure remain committed even when the command that required preparation later fails its rerun guard.
14. Pushed commands continue preserving their complete encoded frontend/staged/pushed provenance. The new cursor belongs only to the enclosing immutable pushed block and is not copied onto individual commands or rebuilt outcomes.
15. The new field is required by the pushed-block runtime schema and persisted JSON. Do not add an optional field, default, compatibility union, decoder fallback, or alternate finalization path for rows written by older code.
16. Wipe stale local and development Durable Object state containing old pushed-block rows before verification; do not add an in-place row migration.
17. Do not add a helper, wrapper, service, named type assignment, re-export, index barrel, `as const`, cast marker, or unrelated cleanup for this behavior.
18. Update the FrontendApi push-path architecture documentation and any directly affected pushed-block pattern example in the same implementation pass so the guard trust boundary, comparison timing, and required cursor field match source behavior.

## Testing Decisions

1. Use the existing FrontendRepo workerd spec seam to prove that pushed-block creation captures the repo-local authoritative `lastAccountCursor`, including `null`, encodes it, and persists it in the pushed-block outbox.
2. Use the existing AccountRepo workerd spec seam to prove that exact cursor equality selects trusted mode and does not rerun a frontend guard.
3. At the AccountRepo seam, advance the authoritative account frontier beyond the block's admission cursor and prove that the original frontend guard reruns against current AccountRepo state.
4. Prove that a rerun guard failure preserves the original guard error, emits a full failed pushed-command outcome, rolls back that command's writes, and permits a later sibling to execute.
5. Prove that commands are revalidated sequentially and that a later command observes the authoritative result of an earlier successful sibling.
6. Extend the existing pushed ServiceBlock-alignment coverage to prove that the cursor comparison occurs after relevant commandless alignment, that the resulting mismatch selects revalidation mode, and that alignment remains committed if the rerun guard fails.
7. Extend duplicate pushed-block coverage to prove that a stored outcome is returned without guard execution even after AccountRepo advances.
8. Keep these two existing workerd seams. Do not add a test-only production API, injectable guard registry, guard counter, or new fixture abstraction solely to observe the branch.
9. Run verification through the relevant Nx targets: system-worker workerd tests and the TypeScript targets for core and system-worker. Run wiki freshness verification after updating architecture documentation.

## Out of Scope

1. Creating a new AccountRepo guard system or changing existing frontend guard definitions.
2. Eliminating authoritative frontend-to-account adaptation, account mutation preparation, replication snapshots, or mutation application.
3. Moving guard responsibility to a different runtime boundary.
4. Changing pushed-command ordering, per-command savepoint isolation, account cursor/index semantics, or pushed-block delivery retry policy.
5. Adding compatibility handling or an in-place migration for persisted pushed blocks that lack the admission cursor.
6. Creating an implementation plan or implementing production code as part of this spec-writing pass.

## Further Notes

1. `lastAccountCursor` is used instead of `accountIndex` because cursor equality identifies the exact authoritative ledger frontier rather than only an ordinal position.
2. Block-level comparison is intentional. Commands admitted in one FrontendRepo transaction share one starting authoritative frontier, and AccountRepo's own earlier siblings must not cause mixed trusted and revalidated modes within that block.
3. FrontendRepo may contain optimistic commands from earlier pushed blocks. Strict outbox delivery ensures an earlier block finalizes first; its account outcome advances AccountRepo, causing the later block's older admission cursor to mismatch and its guards to rerun.
