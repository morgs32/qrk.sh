/**
 * AC owns immutable complete admission bytes and the base-version pointer.
 * A VAR for each aggregateVersion prepares admitted commands outside its
 * SQLite transaction, then commits resources, terminal results, and its hash
 * together. VAC retains the results after VAR's delete-mode executedCommands outbox delivers.
 * AC fanout invokes VAR.versionedAggregateFanoutQueueSubscriber
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
 * AC contains aggregate commands only. VAR and UVAR consume their authored
 * service-version pins directly from VSC, using independent service cursors
 * and resource enrollment. VAR installs authoritative replicas before guards;
 * successful finalized replicate mutations carry the effective resource,
 * serviceVersion, and serviceIndex. Service updates never create VAC entries.
 * UVAR publishes aggregate and service progress through one UVAC history,
 * ordered by userIndex with a separate aggregateIndex watermark.
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
