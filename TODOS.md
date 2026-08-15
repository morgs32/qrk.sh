# Todos

- Audit the block paths after they settle: AggregateRepo → AggregateBlockRepo → AggregateFrontendRepo → AggregateFrontendBlockRepo; ServiceRepo → singleton ServiceBlockRepo → subscribed AggregateRepo; and ServiceRepo → singleton ServiceBlockRepo → ServiceFrontendRepo → ServiceFrontendBlockRepo.
- Design safe archive compaction, retained-snapshot floors, subscriber/replica garbage collection, and legacy generation-rooted VFS cleanup after the continuous-lineage and staged-command-journal implementation has shipped.
- Design terminal staged-command journal compaction after the retention-only first implementation. A terminal row contains the full command, optimistic mutations and inverses, push provenance, and terminal outcome, so deletion requires durable proof that authoritative server state or archives and every relevant exact-lock materialization can reconstruct it, no retained frontend version needs the original payload, and a retained compaction floor or marker distinguishes deleted history from lost intent.
- Add explicit operator export, recovery, and reset tooling for a corrupt aggregate staged-command journal or a legacy aggregate replica that may contain the only durable copy of unpushed commands.
- Implement and verify the exact-lock database initialization crash protocol:
  1. Serialize first acquisition by exact identity inside the user-bound root and durably insert the immutable catalog locator before creating mutable replica state.
  2. Derive or allocate the physical database location before that insert without opening a second candidate database. Every retry that observes the locator must reopen exactly that location and must never allocate a replacement.
  3. Bootstrap the exact database idempotently in one transaction that writes its schema receipt, exact identity, canonical lock/spec bytes, and initial ready snapshot together.
  4. Resume an empty or wholly uninitialized located database after interruption. Preserve bytes and fail manual-clear-required for a non-empty database whose receipt or identity does not match; never infer, overwrite, or automatically delete it.
  5. Test restart after the locator commit but before database creation, after opening but before the bootstrap transaction commits, after bootstrap commits but before acquisition returns, and during concurrent same-identity acquisition. Every case must retain one locator, one physical database, and one initialized exact Repo.
- Add some abstractions so that the Worker files in all the examples are simpler.
- Create our own simpler version of IEitherEncoded
- When we upgrade Node from 24, let's look to see if we can get rid of the tslib dependency.
