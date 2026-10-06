/**
 * IExecutedAggregateCommand / IExecutedServiceCommand identify the original owner.
 * Forwarding preserves that discriminator, original admission position, and result.
 * Outboxes contain pending flat commands plus required delivery metadata only;
 * durable receiving history and unresolved staging journals survive deletion.
 * Retain stable encoded command input and provenance alongside operation-owned results.
 * Copy original encoded shared columns when transferring validated rows between stores.
 * Admission and execution are JSON results; successful local staging belongs to the session/node.
 * Push only stable command input and required provenance to admission.
 * Receiving positions identify occurrences; owned operation bodies project locally.
 * Browser terminals are direct AggregateBrowserCommand or ServiceBrowserCommand values.
 * Disclose id, commandName, selected delta, nullable public failure, and concrete domain checkpoints.
 * Aggregate checkpoints are executedIndex/executedHash/aggregateIndex; service checkpoints
 * are executedIndex/serviceHash/serviceIndex. Private input, claims, authoritative result,
 * and server timing never enter terminal delivery. Retain telemetry envelopes where required.
 * Node journalIndex and tab sessionIndex identify occurrences independently of original command ID.
 * Allocate sessionIndex for every newly retained tab row; keep its identity and nextSessionIndex
 * across updates and restored history even when the live sessionId changes.
 * Allocate nodeIndex only for local submissions; admissionIndex records acceptance alone.
 * Allocate changeIndex with each row mutation, resource application, settlement, and checkpoint
 * transaction. Publish after commit, and emit known staged input before its terminal command.
 *
 * @bad Put staging data in the server command or copy queue bookkeeping into another store.
 * @bad Duplicate command identity, positions, or payload inside a failure/result JSON value.
 * @bad Spread private authentication or owned operation bodies into a browser terminal command.
 * @bad Manufacture a receiving command ID or rerun an originating command program during actor projection.
 */
export function retainCommand<COMMAND>(props: {
  command: COMMAND;
  insert(command: COMMAND): void;
}) {
  props.insert(props.command);
  return props.command;
}
