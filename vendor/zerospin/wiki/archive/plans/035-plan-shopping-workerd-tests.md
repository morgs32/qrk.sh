# Shopping Workerd tests

**Date:** 2026-10-03
**Status:** Completed and verified on 2026-10-03.

## Agreed behavior

1. Replace both Shopping runtime scripts with named Workerd tests using the real backend command path. Cover Durable Object restart with retained storage; retain the framework's whole-process crash matrix.
2. Submit checkout through the marketplace shopper actor and tracking through the user aggregate admin actor. Assert authoritative rows and provider effects, including frozen prices, cart consumption, payment decline, coalescing, rejection and unchanged retries.
3. Recover payment, label creation and checkout transfer after forced object teardown, including loss of a successful purchase-delivery response. Calls may repeat; charges, purchases and labels remain unique.
4. Keep existing fast fixtures for rollback, stale observations, endpoint authentication, strict input and cold imports. Preserve unrelated work in progress and use only disposable test storage. Shopping browser verification remains prohibited.
5. [ADR 001](../../adrs/001-async-replay-retains-output-without-production.md) continues to govern retained async input, immutable evidence and production-free replay. Production APIs and contracts do not change.

## Implementation

1. Add `test/checkout.workerd.spec.ts`, `test/tracking.workerd.spec.ts`, and `test/fulfillment-recovery.workerd.spec.ts` under `examples/shopping`, using the exact test titles approved in this chat.
2. Add `vitest.workerd.config.ts`, `test/env.d.ts` and `test/support/{worker,ShoppingProvidersTest,ShoppingPurchaseDeliveryTest,shoppingBackend}.ts`. Pin Vitest 4.1.11 and `@cloudflare/vitest-plugin` 1.3.6; add `shopping:test:workerd` with existing dependency execution.
3. Register the real backend classes using the existing framework configuration. Substitute only Shopping's provider and delivery layer imports inside the test configuration. Decorated delivery calls the actual administrative command path.
4. Persist controlled provider input, evidence, effect counts and one-shot barriers synchronously in SQLite. Pause before returning provider evidence or immediately before/after real purchase delivery.
5. Install Date-only fake time before object construction, reach the durable barrier, abort all instances, reactivate before the retained deadline, advance beyond it and invoke the registered alarm. Use real timers for bounded polling.
6. Reuse runtime TypeScript configuration for the new tests. Delete both old runtime scripts, their fixtures and unused fixture-only runtime config only after replacement coverage passes; remove obsolete Nx commands and references.

## Verification and documentation

1. Run `CI=true pnpm nx run shopping:test:workerd`, followed by Shopping typing, lint and existing fast checks.
2. Run `system-worker:async-contracts:check` and `system-worker:async-contracts:runtime-check` to verify retained generic recovery coverage.
3. Update Shopping's README. Reconcile implemented terminology with the existing glossary; create an ADR only for an implemented decision that is hard to reverse, surprising without context and the result of a real trade-off.
4. Record verification evidence, set Remaining work to None and archive this plan, preserving its filename and repairing links.

## Test inventory

All three files live in `examples/shopping/test/`; the pending/declined parameterization produces 14 cases from these 13 titles.

1. `checkout.workerd.spec.ts`
   1. `checks out authoritative cart items and automatically pays the frozen purchase`
   2. `retrying the same checkout command preserves the purchase and later cart additions`
   3. `declined payment retains the purchase and items without restoring the cart`
   4. `rejects checkout of another shopper's cart without creating a purchase or payment`
2. `tracking.workerd.spec.ts`
   1. `creates a tracking label for a paid purchase without changing payment state`
   2. `rejects tracking labels for pending and declined purchases` — one case per state.
   3. `coalesces overlapping label requests and reuses the completed label`
   4. `rejects tracking refresh until a label is ready`
   5. `coalesces overlapping refresh requests and advances tracking in sequence`
3. `fulfillment-recovery.workerd.spec.ts`
   1. `resumes payment after object restart using the original input and business key`
   2. `resumes label creation after object restart using the original input and business key`
   3. `resumes checkout transfer after object restart without consuming later cart additions`
   4. `retries purchase delivery after response loss with the identical complete command`

## Verification evidence

1. Continued implementation and verification live in the managed `shopping-workerd-tests` worktree on `codex/shopping-workerd-tests`, created from commit `05a2a76bf`. The user requested the framework fix on a worktree; the primary checkout was untouched during this continuation.
2. `CI=true pnpm nx run shopping:test:workerd` passed all 14 cases across the three named files. Recovery preserves frozen input, complete command identity and unique business effects after retained-storage object replacement. Provider calls may repeat. Date-only fake time, fresh stubs and reopening dormant objects before clearing test storage are verified.
3. After removing the replaced pipelines, `CI=true pnpm nx run-many -t ts lint agent-preview:check marketplace:check checkout:check agents:cold-check -p shopping` passed with normal dependencies and no lint warnings. A clean installation exposed the fast fixtures' undeclared `tsx` executable; Shopping now declares the existing workspace version, 4.21.0.
4. `system-worker:ts`, `system-worker:lint`, `system-worker:async-contracts:check` and `system-worker:async-contracts:runtime-check` passed. The runtime matrix retained all four whole-process crash boundaries: source commit, provider effect, evidence recording and child admission.
5. The real backend path exposed an existing receipt defect. `AggregateChain.receiveExecutedAggregateCommands` now supplies the receiving chain's `aggregateIndex` before decoding transported async output. Duplicate receipt compares the same transport projection, including its async operation discriminator. The existing framework fixture delivers a real projection without `aggregateIndex` twice and verifies one retained result and unchanged emission.
6. Test provider layers decode domain evidence from disposable RPC responses and dispose those responses before returning. This removes Cloudflare's transport disposal symbol before the existing strict evidence validation. Public production APIs, contracts and fixed schemas remain unchanged. Tracking rejection assertions check the existing API failure codes.
7. Both Shopping runtime scripts, their two fixture implementations and unused fixture-only configuration were deleted. Both obsolete Nx commands and fixture-only TypeScript entries were removed. Shopping's README now describes the named suite and retained framework matrix.
8. Glossary wording describes authoritative checkout followed by retained purchase transfer. No new ADR is warranted by reversible test configuration or correction of the existing receipt behavior; ADR 001 continues to govern async retention and replay.

## Remaining work

None.
