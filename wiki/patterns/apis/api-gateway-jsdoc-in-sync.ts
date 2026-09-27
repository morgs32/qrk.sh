/**
 * Keep API and socket lifecycle JSDoc aligned with their delegation and architecture workflow.
 * AggregateSessionApi exposes snapshots, selected history, tickets, and service queries.
 * AggregateActorVersionChain.onMessage owns definition admission after exact resume validation;
 * it forwards the complete occurrence to AggregateChain and returns its receipt on the same socket.
 * VAR executes asynchronously; selected completion or snapshot reconciliation resolves optimism.
 *
 * @bad Describe definition admission as an AggregateSessionApi RPC.
 * @bad Change admission delegation without updating lifecycle JSDoc and architecture pages.
 */
export {};
