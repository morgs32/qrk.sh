# 027 — Pushed-block Guard Revalidation Implementation Plan

**Source spec:** `../archived/027-spec-pushed-block-guard-revalidation.md`

**Status:** Implemented and verified 2026-07-15.

## Summary

1. Add one required nullable `admissionLastAccountCursor` to the existing immutable pushed-block shape and runtime schema.
2. Capture FrontendRepo's authoritative account cursor in the same transaction that runs guards and stores the pushed block.
3. Let AccountRepo trust the block's prior guard results only when its cursor still equals the admission cursor after retained ServiceBlock alignment.
4. On cursor mismatch, rerun each command's original frontend guards sequentially inside its existing AccountRepo savepoint before applying authoritative mutations.
5. Preserve full command provenance, pushed-block idempotency, grouped preparation, service alignment, command failures, downstream fanout, and all unrelated WIP.

## Relationship to Active Plans and WIP

1. Implement this plan on top of the current plan 008 table-bound-reference and generation-scoped repo work. Do not restore earlier table shapes, repo names, route keys, casts, exports, or controller-release terminology.
2. Preserve plan 009's current grouped `prepareAccountCommands` and pushed ServiceBlock-alignment flow. Plan 027 adds the guard trust decision after alignment; it does not regroup replication refs, move snapshot RPCs, or extract the alignment loop.
3. Preserve every unrelated dirty file and partially authored edit. Modify only pushed-block contracts, the two push/finalization paths, their focused fixtures/tests, and directly affected architecture/pattern documentation.
4. Keep plan 027 active until its focused verification and documentation freshness checks pass. Do not archive it merely because production code is present.

## Implementation

1. Extend the existing pushed-block wire contract without adding another type.
   1. Add required `admissionLastAccountCursor: IAccountCursor | null` directly to `IPushedBlock` in `packages/core/src/contracts/types.ts`; reuse the already imported `IAccountCursor`.
   2. Add the matching required `Schema.NullOr(makeAbbreviationIdSchema(coreAbbreviations.accountCursor))` field to `PushedBlockSchema` in `packages/core/src/contracts/CommandSchema.ts`.
   3. Keep the cursor on the enclosing block only. Do not add it to `IPushedCommand`, executed/failed command shapes, AccountBlock rows, or a separate pushed-block outbox column.
   4. Keep the field required during both decoded-object and persisted-JSON validation. Do not add an optional property, default, transform, compatibility union, or legacy decoder.
   5. Update existing pushed-block literals and encoded fixtures to provide their actual intended admission cursor. Use `null` only when the fixture represents the initial authoritative account frontier.
   6. Add core schema coverage for a valid null cursor, a valid `acur_*` cursor, rejection of a missing cursor, and rejection of a wrongly prefixed cursor.

2. Capture FrontendRepo's admission frontier inside the existing admission transaction.
   1. Import the existing `getLastAccountCursor` Effect into `packages/system-worker/src/FrontendRepo/pushCommands/pushCommands.ts`; do not add a local reader or wrapper.
   2. After `bootstrap` and at the start of the existing `makeTx` program, read the repo-local cursor once with `defaultValue: null`, before processing any staged command guards.
   3. Keep that one value unchanged for the full request so every successful command admitted by the transaction shares one block-level frontier.
   4. Add `admissionLastAccountCursor` to the pushed-block literal before encoding and inserting the existing JSON outbox row.
   5. Preserve empty requests, retry classification, guard execution, per-command savepoints, optimistic mutations, cursor assignment, outbox insertion, and the admission response exactly as they are.
   6. Update the function overview and numbered inline checkpoints so the account-frontier read and immutable-block persistence are explicit and synchronized.

3. Track AccountRepo's current frontier through retained ServiceBlock alignment.
   1. Import the existing `getLastAccountCursor` alongside the existing account-index/cursor setters in `packages/system-worker/src/AccountRepo/finalizePushedCommands/finalizePushedCommands.ts`.
   2. Keep the existing scope/session validation and pushed-block-id lookup first. A duplicate block must decode and return its stored outcome without reading the admission cursor or running a guard.
   3. At the start of the existing pushed-finalization transaction, read `currentLastAccountCursor` with `defaultValue: null` beside `currentAccountIndex`.
   4. Preserve grouped adaptation and `prepareAccountCommands` before the transaction, including all original command positions and `Either` failures.
   5. Preserve the explicit ServiceBlock-alignment loop. Whenever it creates a relevant commandless AccountBlock, assign that block's newly generated account cursor to the transaction-local `currentLastAccountCursor` after `makeAccountBlockTx` succeeds.
   6. Do not advance `currentLastAccountCursor` for a retained ServiceBlock that advances only the service-subscription watermark and emits no AccountBlock.
   7. After all service groups reach their prepared watermarks and before the pushed-command loop, compare `currentLastAccountCursor` once with `pushedBlock.admissionLastAccountCursor` and store the boolean guard mode in a plain local binding.
   8. Treat exact equality, including `null === null`, as trusted mode. Treat every unequal opaque cursor pair as revalidation mode; do not compare cursor order or consult `accountIndex` for this decision.

4. Rerun original frontend guards only in AccountRepo revalidation mode.
   1. Keep one savepoint per pushed command and keep command processing in pushed-block order.
   2. Move the existing preparation-failure branch into the command savepoint so every command enters the same finalization path; trusted mode immediately yields the prepared failure, while revalidation mode runs the original frontend checks first and then yields any remaining preparation failure.
   3. In revalidation mode, resolve the command's existing frontend binding from its account, actor, and frontend names inside the command savepoint.
   4. Resolve the original frontend contract from `frontendBinding.frontendController.contracts`, verify the pushed command version, decode its encoded frontend payload, and run the contract's existing payload validation exactly as FrontendRepo admission does.
   5. Resolve the exact guard array from `frontendBinding.frontendController.guards` by the original command name.
   6. Run the guards explicitly in declared order with the original `actorId`, validated frontend payload, and current AccountRepo savepoint transaction.
   7. After the guards succeed, apply the already prepared authoritative mutations through the existing explicit mutation loop. Do not rerun frontend mutation construction and do not bypass frontend-to-account adaptation or account preparation.
   8. In trusted mode, skip contract decoding, payload validation, guard lookup, and guard execution, then apply the prepared authoritative mutations through the same savepoint.
   9. Let the existing savepoint `Either` turn a guard, preparation, or authoritative mutation failure into one full `IFailedPushedCommand`. Serialize the original error unchanged, allocate its normal account cursor/index, apply none of that command's mutations, and continue with later siblings.
   10. Preserve successful commands as full authoritative executed pushed commands and preserve the final flat AccountBlock after all intermediate alignment blocks.
   11. Do not copy `admissionLastAccountCursor` onto command outcomes or persist it in AccountRepo after finalization; pushed-block-id idempotency remains the retry authority.
   12. Update the function overview and matching numbered checkpoints to describe idempotency, preparation, alignment, one block-level trust decision, per-command revalidation/application, and final publication.

5. Make sequential guard visibility observable only in the existing system-worker fixture.
   1. In `packages/system-worker/src/fixtures/system.ts`, add an `updateList` guard directly in the existing `main.guards` object; do not add a helper, export, type, fixture controller, or production test hook.
   2. Have that guard query the existing List table through its supplied `db` and fail with a stable `list-not-found` `ZerospinError` when the payload's list id does not exist.
   3. Preserve the current `createList` invalid-name guard unchanged so its payload-only failure remains available to distinguish trusted mode from revalidation mode.
   4. Use the new fixture-only state-reading guard to prove that a later stale-mode command observes a list created by an earlier successful sibling in the same pushed block.
   5. Do not change runtime guard APIs or application guard semantics outside this test system.

6. Extend focused FrontendRepo and AccountRepo workerd coverage.
   1. In `FrontendRepo.workerd.spec.ts`, assert that initial pushed-block JSON contains `admissionLastAccountCursor: null`.
   2. Bootstrap or advance a FrontendRepo to a real `acur_*` frontier, push another command, and assert that the exact repo-local cursor is encoded in its immutable outbox block.
   3. Preserve existing cursor-classification, optimistic mutation, outbox ordering, retry, and rebase assertions while updating all manually encoded pushed blocks with the required field.
   4. In `AccountRepo.workerd.spec.ts`, finalize a direct block whose admission cursor equals AccountRepo's current cursor and whose existing payload-only frontend guard would reject if called; assert authoritative execution to prove trusted mode skipped the guard.
   5. Advance AccountRepo, submit a block carrying its older admission cursor, and assert the same original guard error is stored in the full failed pushed-command outcome.
   6. In stale mode, finalize an ordered create-list then update-list block and assert the update guard sees the earlier sibling's committed list and both commands execute.
   7. Add a stale-mode block whose first command fails its guard and whose later independent sibling succeeds; assert no failed-command mutations, preserved error text/provenance, later success, and ordered account cursor/index outcomes.
   8. Extend the existing pushed ServiceBlock-alignment case with a replication-owning command plus a guarded command. Assert that a relevant intermediate AccountBlock changes the comparison cursor, selects revalidation, remains committed when the guarded command fails, and precedes the final pushed AccountBlock.
   9. After finalizing a pushed block once, advance AccountRepo and redeliver the identical block. Assert the exact stored outcome returns and no guard-derived result changes.
   10. Update every direct pushed-block literal in the AccountRepo suite with its deliberate admission cursor; do not use a fixture builder or loop to mass-produce blocks.

7. Synchronize the push architecture and reusable pattern.
   1. Use the repository `update-architecture` workflow while updating `wiki/architecture/FrontendApi.md`.
   2. Update the push sequence and annotated steps to show FrontendRepo capturing `admissionLastAccountCursor`, AccountRepo applying retained ServiceBlocks, comparing the post-alignment cursor, trusting equal-watermark guards, and sequentially rerunning guards on mismatch.
   3. State that the cursor certifies frontend guard evaluation only; adaptation, preparation, alignment, authoritative application, ledger assignment, and fanout always remain authoritative AccountRepo work.
   4. Document that duplicate pushed-block idempotency precedes the cursor decision and that `null` is the initial frontier.
   5. Refresh `FrontendApi.md` source line ranges, source hashes, relevant diagram labels, citations, and wiki log entry after source edits.
   6. Update `llm-wiki/patterns/system-worker/frontend-repo-owned-push.ts` so its mock block includes the admission cursor and its AccountRepo side demonstrates equal-cursor trust versus mismatch revalidation without adding a generic helper abstraction.
   7. Search architecture, patterns, comments, and tests for pushed-block descriptions that would falsely imply unconditional AccountRepo guard execution or omit the required cursor; update only directly stale references.

8. Remove stale local state and verify the complete behavior.
   1. Stop any local Wrangler process before deleting generated state.
   2. Remove the existing generated Durable Object state under `examples/parking/.wrangler/state/v3/do` and `packages/core/.wrangler/state/v3/do`; remove the equivalent `examples/shopping/.wrangler/state/v3/do` or `packages/system-worker/.wrangler/state/v3/do` only if it exists when verification begins.
   3. Do not migrate, decode, or retain pushed-block rows that lack `admissionLastAccountCursor`.
   4. Run focused contract and type verification through Nx.

      ```text
      nx run core:ts
      nx run core:test
      nx run system-worker:ts
      ```

   5. Run the complete system-worker workerd target through Nx after focused spec development.

      ```text
      nx run system-worker:test:workerd
      ```

   6. Run focused lint through Nx for the changed projects.

      ```text
      nx run core:lint
      nx run system-worker:lint
      ```

   7. Run architecture freshness and stale-symbol checks.

      ```text
      .llmwiki/freshness.sh --stale-only
      rg -n "admissionLastAccountCursor|PushedBlockSchema" packages wiki/architecture llm-wiki/patterns
      ```

   8. Run affected checks only after the focused targets pass, and classify unrelated active-plan/WIP failures separately from plan-027 regressions.

      ```text
      nx affected -t ts,lint,test
      ```

   9. Audit the final diff.

      ```text
      git diff --check
      git status --short
      ```

   10. Confirm the diff contains no new `ALLOWED_CAST`, `as const`, named type assignment, helper/wrapper/service, re-export, dependency, compatibility field, fallback decoder, command truncation, or unrelated cleanup.

## Guardrails

1. Do not add an `ALLOWED_CAST` marker. Stop for explicit user permission if an unavoidable assertion would require one.
2. Do not add `as const`, a named type alias/interface, a helper, wrapper, utility, service, barrel export, dependency, or one-consumer shape file.
3. Keep the implementation verbose and annotated. Use the existing explicit command and guard loops; do not replace them with a new iterator, reducer, lookup abstraction, or shared guard runner.
4. Keep `FrontendRepo.pushCommands` and `AccountRepo.finalizePushedCommands` as the named Effects in their same-named method folders. Keep public Durable Object methods as thin runtime boundaries.
5. Preserve the full encoded command objects across pushed, executed, failed, AccountBlock, ActorBlock, and FrontendBlock paths.
6. Preserve existing ServiceBlock alignment and commandless AccountBlock behavior. A guard failure does not roll back independent alignment work committed in the same finalization transaction.
7. Preserve pushed-block outbox ordering, retry counts, actor terminus cleanup, generation admission, and downstream convergence behavior.
8. Add no old-state compatibility, optional schema field, nullable default beyond the explicit canonical `null` frontier, alternate runtime path, or in-place persisted-row migration.
9. Do not archive this plan until production behavior, focused tests, complete workerd verification, documentation updates, and freshness checks are green.
