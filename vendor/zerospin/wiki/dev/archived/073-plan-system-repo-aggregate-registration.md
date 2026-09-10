# SystemRepo aggregate registration

Status: implemented and verified on 2026-09-08.

## Ownership and discovery

1. SystemRepo owns known `{ aggregateName, aggregateId }` pairs and supported `{ aggregateName, aggregateVersion }` rows within its bound `systemId`. Its activation upserts current and historical authored versions, retaining additive history.
2. Successful aggregate frontend authorization registers the checked pair before returning the capability. Validated secret-key command and query requests register before dispatch; subsequent execution failure does not erase discovery. Rejected authorization, malformed envelopes, and unknown aggregate names do not register pairs.
3. Extend `upsertAggregate` with the aggregate name and remove `getAggregateIds`. Idempotent registration retries wakeups. Aggregate discovery never creates a cross-product with unrelated authored aggregate names.

## Activation and inspection

1. Move SystemRepo to the common fixed-schema Repo lifecycle while preserving its exact physical name, configured identity check, ticket behavior, and public capabilities. SystemRepo does not register itself through its own generic callback.
2. The approved `wakeAggregateMaterializers({ db, systemId, aggregate? })` Effect joins known pairs with supported versions of that name. `onDOActivation`, `upsertAggregate`, and `initialize` invoke it. It launches `ready()` calls without awaiting completion and observes each transport rejection and encoded failure independently.
3. Wakeups are best effort, without SystemRepo retry queues or alarms. Activation, initialization, successful frontend authorization, and validated direct access retry them. A missed idle VMAR may remain unsubscribed. `initialize` preserves existing service initialization.
4. VMAR activation retains its subscription-recovery alarm. The alarm catches up and subscribes to AAC, recovers committed service subscriptions, and drains publication. Recovery is released only after all subscriptions succeed; remote work holds neither the activation gate nor the execution permit. Readiness does not imply catch-up completion. Receive and direct execution finalizers drain results only, so completing or failing a replay page cannot recursively restart subscription recovery.
5. AAC only initializes an absent base/halt state during activation. Actual queue subscription owns VMAR enrollment. Delete eager authored-version registration, its missing-base-subscriber assertion, and unused `validatedAgainstAggregateVersion` metadata.
6. Remove AAC/VMAR generic Repo registration and VMAR's identity-upsert bootstrap callback. Derive inspectable AAC/VMAR entries from the SystemRepo catalogs, including supported but inactive versions and historical model table names. Other Repo registrations retain their existing behavior and the inspection result shape remains unchanged.

## Verification

1. Exercise accepted/rejected frontend discovery, initial direct command/query access, malformed/unknown targets, repeated registration, current/historical versions, and two aggregate names in the real Workerd harness.
2. Verify additive catalog refresh, preserved known pairs and physical identities, autonomous VMAR self-subscription/materialization/publication, and recovery after cold activation without manually delivering command pages.
3. Test deferred readiness, transport/encoded failures, independent launches, and subsequent retries at the helper seam. Extend inspection tests for unopened versions and absence of AAC/VMAR callback registrations; retain service registration coverage. Verify failed receive leaves subscriptions to the retained alarm without immediate recursive replay.
4. Verified `nx run system-worker:test` (156 tests), `nx run system-worker:test:workerd` (42 tests), and `nx run system-worker:ts`. `nx run system-worker:lint` completed with zero errors and 21 existing warnings. Changed-source formatting, documentation links and diagram numbering, and `git diff --check` also passed.
5. The real-runtime failure regression confirms that failed VMAR receipt does not recursively launch source catch-up and retains alarm recovery. The pinned-service test now waits for VMAR delivery independently of VMARR delivery.

## Persistence and deferred policy

1. Changed physical schemas require empty storage, with no compatibility paths or translation migrations. Do not reset shared or remote state without explicit approval. Subsequent additive authored aggregate versions retain the same `systemId`, catalog, and command history while existing physical schemas remain immutable.
2. Cutover, `finalize*`, default selection, and version retirement remain outside this change. Cutover still requires actual enrollment. Preserve current invalidation behavior: pull-based catch-up may execute an invalidated VMAR while AAC excludes it from pushes; track the future policy decision in `TODOS.md`.
