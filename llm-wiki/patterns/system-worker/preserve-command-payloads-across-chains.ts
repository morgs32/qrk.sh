/**
 * Persist and forward the complete encoded command occurrence unchanged across chains, outboxes, RPC, WebSocket, and replica journals.
 *
 * @bad Rebuild a terminal command from selected fields before forwarding it.
 * @bad Null `sessionId`, `userId`, `frontendName`, or `pushIndex` provenance.
 * @bad Replace the structural pending, success, or failure occurrence with a lifecycle row.
 */
export function retainCompleteOccurrence<COMMAND>(props: {
  command: COMMAND;
  insert(command: COMMAND): void;
}) {
  props.insert(props.command);
  return props.command;
}
