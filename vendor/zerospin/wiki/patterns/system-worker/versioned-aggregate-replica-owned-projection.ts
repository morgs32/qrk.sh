/**
 * ActorVAR owns a versioned aggregate replica, the preceding selected/projected
 * graph, the aggregate watermark and one executed cursor, and an actorCommands outbox.
 * Project each VAC entry without programs or staging guards; compare the retained
 * preceding view with the new view, then atomically commit one output.
 * Include relationship-driven entry/exit and empty progress. The selected occurrence
 * retains the complete source-scoped command, positions, actorDelta, and executed
 * hash. ActorVAC stores completion-owner metadata separately and projects private
 * failure only to that exact identity, session, and node.
 * Snapshots reconcile only requested IDs through their captured executed cursor
 * using ActorVAC history.
 * ActorVAC persists that output before ActorVAR acknowledges the retained outbox page.
 *
 * @bad Recompute the preceding published view under a newer projection.
 * @bad Merge create/delete or failure/no-op positions into a delivery batch.
 * @bad Publish pending optimism or persist it in authoritative resource tables.
 * @bad Advance to a later confirmed entry before staging the current automation group.
 * @bad Return a snapshot before ActorVAC has durably published its captured cursor.
 */
export {};
