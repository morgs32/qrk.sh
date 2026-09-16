import { modulesHash } from "@qrk.sh/library";
import { Outlet, type LoaderFunctionArgs, useLocation } from "react-router";

export function loader({ params }: LoaderFunctionArgs) {
  if (!params.moduleId) throw new Response("Not found", { status: 404 });
  if (!modulesHash[params.moduleId]) throw new Response("Not found", { status: 404 });
  return null;
}

export default function ModulePage() {
  const location = useLocation();
  return <Outlet key={location.pathname + location.search} />;
}
