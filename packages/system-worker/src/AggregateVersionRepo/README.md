# AggregateVersionRepo

VAR executes aggregate commands and consumes the service versions pinned by its aggregate definition. Its execution permit serializes program evaluation, asynchronous initial-resource fetching, aggregate guards, and commit against incoming service applications. Contract and actor guards run earlier in AAVR actor staging; AVR does not rerun them.

An aggregate version's optional command extension runs only in AVR after its shared mutations have been applied inside the command savepoint. It queries that updated transaction with the aggregate's full model set, then returns additional validated mutations. Those mutations continue the original command's mutation indexes and share its terminal result and final resource delta. A declared aggregate failure or supported mutation application failure rolls back both phases; infrastructure errors abort execution. Client and actor staging do not run extensions.

`head.aggregateIndex` is AC consumption. `head.executedIndex` is the combined output order. Aggregate results and every newly consumed service occurrence each allocate one materialization position. Source progress, effective resource changes, and the output row commit together. Service entries keep their source provenance and never participate in aggregate disposition hashing.

A replica snapshot’s `serviceIndex` is VSR execution progress. A snapshot ahead of the service cursor protects that copy while queued occurrences are still consumed and emitted. A new snapshot behind the cursor is replayed through the missing suffix before enrollment commits. Existing newer copies and tombstones survive older input.

Both inputs use the same outbox. Its alarm is held before work begins, so interruption after commit remains recoverable. VAC retains contiguous immutable materializations; identical retries are accepted and conflicts fail. `getAggregateResult` locates aggregate completion independently of materialization paging, and flush drains through the located materialization position.

`catchupMaterialization` fixes each source catch-up destination, captures the committed materialization checkpoint, and publishes through it. Selected replicas consume that checkpoint through VAC and have no direct service subscription.

The changed fixed schemas require empty storage. There is no row conversion or compatibility decoder.
