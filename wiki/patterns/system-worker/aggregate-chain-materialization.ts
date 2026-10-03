/**
 * AggregateChain retains admitted command order, original executor pins and results.
 * Admission is synchronous and local. Replaying versions wait for original terminal
 * retention, then run their own program and guards against owned state.
 * VAR applies create/update/delete/move in authored order under a business savepoint.
 * Rejection rolls back writes/outputs; terminal disposition, cursor and delivery
 * commit together. Infrastructure failure aborts the enclosing transaction.
 * Original execution queues independent AVC and AC deliveries. Shared operation
 * material survives until both receivers acknowledge, including after restart.
 * Actor repos project committed AVC operations; sessions replay pending local
 * operations over confirmed actor state. Fanout cursors belong to these streams.
 * Changed fixed schemas require empty storage.
 * @bad Hold a SQL transaction across RPC delivery or asynchronous preparation.
 */
export {};
