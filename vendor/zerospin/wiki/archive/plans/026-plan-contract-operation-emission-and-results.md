# Contract operation emission and retained results

Status: Implemented and verified on 2026-10-02. Approved in chat on 2026-10-02.

## Agreed behavior

1. Keep Effect programs; model methods emit typed operations to an execution-owned append-only collector and return void. Whole-program failure discards collected outputs; caught failures/internal retries retain prior emissions. Programs and codecs remain synchronous.
2. Optional per-version result codecs define the return type. Omission requires void and persists null. Include resultJsonSchema in contract/system specs and session locks.
3. Retain encoded staging.result and successful execution.result in existing JSON envelopes. Successful execution records the executing contractVersion. Preserve original staging results during pending replay; expose typed local stage results and explicitly decode retained history by exact contract identity/version.
4. Validate/encode results before resource application; successful output and command retention commit together. Preserve private completion filtering and exact retry integrity checks.
5. Remove alreadyApplied guard skipping, compareOriginalResult, its dedicated original-result getter/helper/tests, and superseded mutation-array authoring paths.
6. Hard cutover all in-scope callers/docs. Preserve unrelated WIP; use fresh disposable storage, no compatibility/reset code. Do not verify Shopping or Tic Tac Toe.

## Implementation and verification

1. Update contract/model operation types, collector, runner, result codecs, ownership/service inference and all make/upgrade overloads.
2. Wire aggregate/service server transactions, browser staging/replay, projection/completion/history, schema specs and locks, SDK exports, and existing authored callers.
3. Add focused type/runtime fixtures for precise inference, fresh ordered collectors, caught failures/retries, synchronous services, async rejection, result codecs and invalid output, transaction rollback, retained version attribution, private delivery, immutable staging and exact delivery retries.
4. Run permitted focused Nx checks and affected library/type/lint checks. Update active docs/patterns/glossary after implementation; create an ADR only for a qualifying implemented trade-off. Archive only after required work is complete.

## Implemented outcome

1. Model operation Effects emit into a fresh execution-owned collector. Exact operation unions and independently codec-defined results survive make/upgrade inference; ordinary caller services remain required. No codec requires void at both typing and runtime boundaries.
2. Aggregate/service staging retains encoded results and exposes typed local values. Replay preserves staging results; authoritative success retains its own result and actual executing version. Codecs run synchronously with an empty service context before resource application. Failed application publishes no successful result.
3. Existing retention, actor projection, completion privacy and history carry the result envelopes. Exact delivery retries include the retained result. The SDK exports result/operation inference and exact identity/version result decoding.
4. Removed successful guard skipping, dedicated original-result comparison APIs/helpers/tests, and return-array authoring patterns. Migrated authored callers and reconciled active architecture, patterns and glossary. Plan 025's comparison requirements are superseded narrowly; its unrelated unfinished work remains active.
5. Changed fixed JSON shapes require empty storage; no compatibility paths or automatic storage deletion were added. No ADR was needed for this implementation.

## Verification evidence

1. `pnpm nx run-many -t contract-programs:check,captured-operations:check -p system-worker` passed. Fresh disposable in-memory SQLite databases cover aggregate/service transaction rollback, immutable staging replay, executing-version attribution, private completion filtering, retained-result retry/conflict integrity, codec round trips/invalid output, ordered/fresh collectors, caught failures/retries, and synchronous/asynchronous execution boundaries.
2. Type assertions and negative compilation fixtures verify exact result/operation inference, ordinary service requirements, owner-model rejection, upgrade inference, and undeclared/incorrect result rejection. `pnpm nx run-many -t ts -p @zerospin/core,@zerospin/browser,system-worker` passed, including its affected library dependencies.
3. `pnpm nx run-many -t lib -p @zerospin/browser,@zerospin/sdk,system-worker` and the final `pnpm nx run @zerospin/sdk:lib` passed. `pnpm nx run-many -t lint -p @zerospin/core,@zerospin/browser,system-worker` passed. `git diff --check` passed.
4. Shopping and Tic Tac Toe verification was excluded as instructed. In-scope authored programs were migrated without running those example targets. Nx Cloud reported the existing access error (401); local checks succeeded.

## Remaining work

None.
