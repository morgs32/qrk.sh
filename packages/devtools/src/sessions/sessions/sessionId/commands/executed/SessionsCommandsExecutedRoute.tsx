import { useAggregateSession } from '../../useSession';
import { SessionsCommandsRowsTable } from '../SessionsCommandsRowsTable';

export function SessionsCommandsExecutedRoute() {
  const session = useAggregateSession();

  if (session === undefined) {
    return null;
  }

  return <SessionsCommandsRowsTable session={session} status="executed" />;
}
