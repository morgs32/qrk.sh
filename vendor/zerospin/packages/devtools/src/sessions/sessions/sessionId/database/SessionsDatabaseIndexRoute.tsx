import { Navigate, useParams } from "react-router";

import { useSession } from "../useSession";

export function SessionsDatabaseIndexRoute() {
  const session = useSession();
  const { sessionId } = useParams();

  if (session === undefined || sessionId === undefined) {
    return null;
  }

  const firstModelName = session.frontend.modelNames[0];

  if (firstModelName === undefined) {
    return null;
  }

  return (
    <Navigate replace relative="path" to={encodeURIComponent(firstModelName)} />
  );
}
