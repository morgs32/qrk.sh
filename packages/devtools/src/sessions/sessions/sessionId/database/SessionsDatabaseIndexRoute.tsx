import { Navigate, useParams } from 'react-router';

import { useAccountSession, useServiceSession } from '../useSession';

export function SessionsDatabaseIndexRoute() {
  const accountSession = useAccountSession();
  const serviceSession = useServiceSession();
  const { sessionId } = useParams();

  if (
    (accountSession === undefined && serviceSession === undefined) ||
    sessionId === undefined
  ) {
    return null;
  }

  const firstModelName =
    accountSession?.frontend.modelNames[0] ?? serviceSession?.modelNames[0];

  if (firstModelName === undefined) {
    return null;
  }

  return (
    <Navigate replace relative="path" to={encodeURIComponent(firstModelName)} />
  );
}
