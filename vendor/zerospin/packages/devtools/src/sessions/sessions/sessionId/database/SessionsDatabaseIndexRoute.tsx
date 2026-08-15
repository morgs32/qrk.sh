import { Navigate, useParams } from 'react-router';

import { useAggregateSession, useServiceSession } from '../useSession';

export function SessionsDatabaseIndexRoute() {
  const aggregateSession = useAggregateSession();
  const serviceSession = useServiceSession();
  const { sessionId } = useParams();

  if (
    (aggregateSession === undefined && serviceSession === undefined) ||
    sessionId === undefined
  ) {
    return null;
  }

  const firstModelName =
    aggregateSession?.frontend.modelNames[0] ?? serviceSession?.modelNames[0];

  if (firstModelName === undefined) {
    return null;
  }

  return (
    <Navigate replace relative="path" to={encodeURIComponent(firstModelName)} />
  );
}
