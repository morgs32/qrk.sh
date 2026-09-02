# Todos

- Add explicit operator export, recovery, and reset tooling for a corrupt aggregate active-command journal that may contain the only durable copy of unpushed commands.
- Implement and verify the exact-lock database initialization crash protocol:
  1. Serialize first acquisition by exact identity inside the user-bound root and durably insert the immutable catalog locator before creating mutable replica state.
  2. Derive or allocate the physical database location before that insert without opening a second candidate database. Every retry that observes the locator must reopen exactly that location and must never allocate a replacement.
  3. Bootstrap the exact database idempotently in one transaction that writes its schema receipt, exact identity, canonical lock/spec bytes, and initial ready snapshot together.
  4. Resume an empty or wholly uninitialized located database after interruption. Preserve bytes and fail manual-clear-required for a non-empty database whose receipt or identity does not match; never infer, overwrite, or automatically delete it.
  5. Test restart after the locator commit but before database creation, after opening but before the bootstrap transaction commits, after bootstrap commits but before acquisition returns, and during concurrent same-identity acquisition. Every case must retain one locator, one physical database, and one initialized exact Repo.
- Add focused model-replica coverage:
  1. Add typechecks proving exact current and historical version-to-attribute inference for both authoritative models and replicas.
  2. Test distinct source/replica identity, source rows without `deletedAt`, replica rows with nullable `deletedAt`, immutable `sourceModel` and literal `serviceName`, historical deletion-state preservation, and replication from a live authoritative resource with `deletedAt: null` initialization.
  3. Test rejection of replicas in service registries, service-owned source objects directly in aggregate registries, one source object owned by multiple services, mismatched replica service/source bindings, service replication contracts, and ordinary aggregate mutations against replicas.
  4. Test exact nested replication resource identity, compatible-version normalization, and renamed service-model adapters that cannot be preempted by an unrelated same-name aggregate model.
  5. Test two related authoritative service models whose replica refs resolve by exact source-table alias across schema, relation, and selection construction, while unrelated and name-only table matches still fail.
  6. Test historical frontend selection so service frontend models remain authoritative without `sourceModel` or `deletedAt`, while aggregate replicas retain `serviceName`, bind `sourceModel` to the selected historical authoritative definition, and include `deletedAt`.
  7. Preserve end-to-end deletion lifecycle coverage for physical service deletion, aggregate replica tombstone retention, same-ID recreation, and ledger-owned retry/resume behavior.
- Enforce deterministic `makeContract()` programs:
  1. Prohibit direct ambient nondeterminism such as `Date`, `Date.now()`, `Math.random()`, `crypto.randomUUID()`, and equivalent wall-clock or random global reads inside contract programs.
  2. Require every durable identity and business timestamp to be carried in the validated command payload or deterministically derived from it; framework-owned execution/application time remains injected by the executor.
  3. Investigate enforcement at the contract authoring/build boundary, such as static analysis or a focused lint rule around programs passed to `makeContract()`; its current Effect service type alone cannot prevent direct JavaScript global access.
  4. Add negative fixtures proving prohibited programs fail the chosen enforcement gate and semantic re-execution fixtures proving the same retained payload reproduces durable identities.
- When documenting CommandChain reconciliation, use the term **“anti-entropy, not retry”** for forward and back catch-up of resolved `IChainedCommand`s. Preserve the distinction that convergence learns an already-resolved command rather than re-executing it. Design context: Codex thread `01a058c0-d43e-71b3-ab7e-bf2597c06c26`.
- Look for **“obvious old residue”** related to fanout and catch-up paths, including the unused `makeFanoutQueue` subscriber-key/boolean-result protocol, the catch-up test that does not exercise catch-up, and decoded-but-discarded catch-up results. Preserve live durable subscriber fanout and initial archive catch-up behavior. Design context: [Codex thread](https://chatgpt.com/s/cx_6a95c076d44481918d3249351e3c8a8f).
- Add some abstractions so that the Worker files in all the examples are simpler.
- When Node is upgraded from 24, check whether the `tslib` dependency can be removed.
