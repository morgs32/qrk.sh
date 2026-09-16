import { modulesHash } from "@qrk.sh/library";
import {
  isRouteErrorResponse,
  Link,
  Outlet,
  type LoaderFunctionArgs,
  useRouteError,
  useLocation} from "react-router";

export function loader({ params }: LoaderFunctionArgs) {
  if (!params.moduleId) throw new Response("Not found", { status: 404 });
  if (!modulesHash[params.moduleId]) throw new Response("Not found", { status: 404 });
  return null;
}

export default function ModulePage() {
  const location = useLocation();
  return <Outlet key={location.pathname + location.search} />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (!isRouteErrorResponse(error) || error.status !== 404) throw error;
  return (
    <main className="mx-auto max-w-3xl p-6" data-testid="module-not-found">
      <h1>Module not found</h1>
      <p>The requested module id is not registered in the library.</p>
      <Link to="/modules">Return to all modules</Link>
    </main>
  );
}
