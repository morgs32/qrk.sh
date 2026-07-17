import { useParams } from "react-router";

import { useSession } from "../useSession";

import { SessionsDatabaseModelRowsTable } from "./SessionsDatabaseModelRowsTable";

function decodeModelNameParam(modelName: string): string {
  try {
    return decodeURIComponent(modelName);
  } catch {
    return modelName;
  }
}

export function SessionsDatabaseModelRoute() {
  const session = useSession();
  const { modelName } = useParams();

  if (session === undefined || modelName === undefined) {
    return null;
  }

  const decoded = decodeModelNameParam(modelName);

  if (!Object.hasOwn(session.frontend.models ?? {}, decoded)) {
    return <span>Unknown model key: {decoded}</span>;
  }

  return (
    <SessionsDatabaseModelRowsTable session={session} modelKey={decoded} />
  );
}
