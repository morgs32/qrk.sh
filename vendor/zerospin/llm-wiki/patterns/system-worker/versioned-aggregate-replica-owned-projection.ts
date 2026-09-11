/**
 * AVAR owns a versioned aggregate replica, the preceding selected/projected
 * graph, aggregate and user cursors, and a delta outbox.
 * Replay each VAC entry without programs or guards; compare the retained
 * preceding view with the new view, then atomically commit one output.
 * Include relationship-driven entry/exit and empty progress. A same-user,
 * resolution retains the complete originating execution entry; AVAC filters
 * delivery to the originating frontend. Snapshots reconcile only requested IDs
 * through their captured user cursor using AVAC history.
 * AVAC persists that output before AVAR deletes the acknowledged outbox page.
 *
 * @bad Recompute the preceding published view under a newer projection.
 * @bad Merge create/delete or failure/no-op positions into a delivery batch.
 * @bad Add server optimism or another materializer downstream of AVAC.
 * @bad Return a snapshot before AVAC has durably published its captured cursor.
 */
export {};
