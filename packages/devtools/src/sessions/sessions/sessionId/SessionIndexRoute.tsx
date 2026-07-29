import { Navigate } from 'react-router';

import { useAccountSession, useServiceSession } from './useSession.js';

export function SessionIndexRoute() {
  const accountSession = useAccountSession();
  const serviceSession = useServiceSession();

  if (accountSession !== undefined) {
    return <Navigate to="commands" replace relative="path" />;
  }

  if (serviceSession !== undefined) {
    return <Navigate to="database" replace relative="path" />;
  }

  return <Navigate to="/sessions" replace />;
}
