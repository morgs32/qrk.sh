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
 * Browser projection delivers only id, commandName, selected delta, and nullable failure.
 * Submission identity and checkpoints stay in server metadata and the delivery envelope.
 *
 * @bad Put staging data in the server command or copy queue bookkeeping into another store.
 * @bad Duplicate command identity, positions, or payload inside a failure/result JSON value.
 * @bad Spread private authentication or owned operation bodies into a client actor output.
 * @bad Manufacture a receiving command ID or rerun an originating command program during actor projection.
 */
export function retainCommand<COMMAND>(props: {
  command: COMMAND;
  insert(command: COMMAND): void;
}) {
  props.insert(props.command);
  return props.command;
}
