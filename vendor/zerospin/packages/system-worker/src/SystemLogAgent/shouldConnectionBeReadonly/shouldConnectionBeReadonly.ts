import type { Connection, ConnectionContext } from 'agents';
import { Effect } from 'effect';

export const shouldConnectionBeReadonly = Effect.fn(
  'SystemLogAgent.shouldConnectionBeReadonly',
)(function* (_props: { connection: Connection; context: ConnectionContext }) {
  return yield* Effect.succeed(true);
});
