/**
 * AC owns immutable complete admission bytes and the base-version pointer.
 * A VAR for each aggregateVersion prepares admitted commands outside its
 * SQLite transaction, then commits resources, terminal results, and its hash
 * together. VAC retains the results after VAR's delete-mode executedCommands outbox delivers.
 * AC fanout invokes VAR.admissionResultsFanoutSubscriber
 * with AC's bound { systemId, aggregateId, aggregateName }, then sends
 * receive({ rows, lastIndex }); delivery advances only to the committed row
 * tail, never to lastIndex. Direct bounded execution uses that same subscriber
 * receive path through catchup(index).
 *
 * AC reconciles VAR destinations from the executing bundle during activation.
 * Existing command cursors and failures survive; removed definitions become
 * inactive. Empty histories open no VARs; command delivery and direct RPCs
 * activate them. VAR retains bounded execution catch-up and activation-owned
 * service subscriptions, without AC self-enrollment. SystemRepo inspection
 * reads explicit Repo registrations.
 *
 * AC contains aggregate commands only. VAR consumes pinned VSC sources and
 * installs authoritative replicas before guards. Its aggregateCommands and
 * serviceCommands tables allocate one head.executedIndex. VAC retains both
 * families and merges them into ordered pages of fanout rows. ActorVAR consumes
 * only VAC and commits one minimal actor output at each source executedIndex,
 * including empty deltas. Its actorState retains executedIndex, executedHash,
 * and the separate aggregateIndex watermark. Service outputs have no aggregate
 * frontend completion owner.
 *
 * Direct retries select the current base and return its retained result.
 * Cutover validates enrollment after its already-promoted shortcut. It samples n and awaits base.flush(n) and candidate.flush(n) in parallel.
 * A flush completes execution and VAC publication through n and returns the
 * exact { aggregateIndex, commandId, dispositionHash } checkpoint.
 *
 * @bad Prepare or retain canonical execution results in AC.
 * @bad Keep original-version request ownership after base cutover.
 * @bad Hold AC's RPC gate or any SQLite transaction across a VAR flush.
 * @bad Require browser publication before returning direct finalization.
 */
export {};
