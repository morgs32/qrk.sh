/**
 * Keep API and socket lifecycle JSDoc aligned with their delegation and architecture workflow.
 * AggregateFrontendApi exposes snapshots, selected history, tickets, and service queries.
 * SelectionVersionedAggregateChain.onMessage owns frontend admission after exact resume validation;
 * it forwards the complete occurrence to AggregateChain and returns its receipt on the same socket.
 * VAR executes asynchronously; selected completion or snapshot reconciliation resolves optimism.
 *
 * @bad Describe frontend admission as an AggregateFrontendApi RPC.
 * @bad Change admission delegation without updating lifecycle JSDoc and architecture pages.
 */
export {};
