import { useAggregateSessionOrThrow } from '../useSession';

import { SessionsCommandsRowsTable } from './SessionsCommandsRowsTable';

export function SessionsCommandsLayout() {
  const session = useAggregateSessionOrThrow();
  return <SessionsCommandsRowsTable session={session} />;
}
