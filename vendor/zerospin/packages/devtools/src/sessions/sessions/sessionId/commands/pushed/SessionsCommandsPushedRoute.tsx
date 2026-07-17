import { useSession } from "../../useSession";
import { SessionsCommandsRowsTable } from "../SessionsCommandsRowsTable";

export function SessionsCommandsPushedRoute() {
  const session = useSession();

  if (session === undefined) {
    return null;
  }

  return <SessionsCommandsRowsTable session={session} status="pushed" />;
}
