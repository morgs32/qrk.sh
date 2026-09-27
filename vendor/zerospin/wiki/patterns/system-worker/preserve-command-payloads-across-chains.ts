/**
 * Retain stable encoded command input and provenance alongside operation-owned results.
 * Copy original encoded shared columns when transferring validated rows between stores.
 * Admission and execution are JSON results; successful local staging belongs to the session/node.
 * Push only stable command input and required provenance to admission.
 * Actor projection explicitly selects permitted resources and private phase summaries.
 *
 * @bad Put staging data in the server command or copy queue bookkeeping into another store.
 * @bad Duplicate command identity, positions, or payload inside a failure/result JSON value.
 * @bad Spread private authentication or full executionDelta into a client actor command.
 */
export function retainCommand<COMMAND>(props: {
  command: COMMAND;
  insert(command: COMMAND): void;
}) {
  props.insert(props.command);
  return props.command;
}
