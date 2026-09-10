import type { Connection, ConnectionContext } from 'agents';
import { Effect } from 'effect';

/*
 * The log agent exposes read-only client connections through its lifecycle
 * policy hook.
 *
 * 1. Mark the connection read-only.
 */
export const shouldConnectionBeReadonly = Effect.fn(
  'SystemLogAgent.shouldConnectionBeReadonly',
)(function* (_props: { connection: Connection; context: ConnectionContext }) {
  // 1 — return true for every connection and context
  return yield* Effect.succeed(true);
});
