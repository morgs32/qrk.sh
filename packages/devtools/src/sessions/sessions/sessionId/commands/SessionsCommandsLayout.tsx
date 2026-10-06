import { useAggregateSession, useServiceSession } from '../useSession';

import {
  ServiceCommandsRowsTable,
  SessionsCommandsRowsTable,
} from './SessionsCommandsRowsTable';

export function SessionsCommandsLayout() {
  const aggregate = useAggregateSession();
  const service = useServiceSession();
  if (aggregate !== undefined) {
    return <SessionsCommandsRowsTable session={aggregate} />;
  }
  if (service !== undefined) {
    return <ServiceCommandsRowsTable session={service} />;
  }
  throw new Error('Session not found');
}
