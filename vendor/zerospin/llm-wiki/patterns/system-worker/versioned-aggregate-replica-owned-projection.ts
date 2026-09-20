/**
 * SelectionVAR owns a versioned aggregate replica, the preceding selected/projected
 * graph, aggregate and selection cursors, and a selectedCommands outbox.
 * Replay each VAC entry without programs or guards; compare the retained
 * preceding view with the new view, then atomically commit one output.
 * Include relationship-driven entry/exit and empty progress. The selected occurrence
 * contains only its opaque source ID, positions, minimal frontend delta, selection
 * hash, and privately deliverable failure. SelectionVAC stores completion-owner
 * metadata separately and exposes failure only to that exact authentication/frontend.
 * Snapshots reconcile only requested IDs through their captured selection cursor
 * using SelectionVAC history.
 * SelectionVAC persists that output before SelectionVAR deletes the acknowledged outbox page.
 *
 * @bad Recompute the preceding published view under a newer projection.
 * @bad Merge create/delete or failure/no-op positions into a delivery batch.
 * @bad Add server optimism or another materializer downstream of SelectionVAC.
 * @bad Return a snapshot before SelectionVAC has durably published its captured cursor.
 */
export {};
