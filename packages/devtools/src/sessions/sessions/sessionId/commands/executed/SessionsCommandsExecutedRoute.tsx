import { useAccountSession } from '../../useSession';
import { SessionsCommandsRowsTable } from '../SessionsCommandsRowsTable';

export function SessionsCommandsExecutedRoute() {
  const session = useAccountSession();

  if (session === undefined) {
    return null;
  }

  return <SessionsCommandsRowsTable session={session} status="executed" />;
}
