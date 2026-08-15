import { Navigate } from 'react-router';

import { useAggregateSession, useServiceSession } from './useSession.js';

export function SessionIndexRoute() {
  const aggregateSession = useAggregateSession();
  const serviceSession = useServiceSession();

  if (aggregateSession !== undefined) {
    return <Navigate to="commands" replace relative="path" />;
  }

  if (serviceSession !== undefined) {
    return <Navigate to="database" replace relative="path" />;
  }

  return <Navigate to="/sessions" replace />;
}
