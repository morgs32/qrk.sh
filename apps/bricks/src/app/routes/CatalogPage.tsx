import { catalogsHash } from "@qrk.sh/bricks";
import {
  isRouteErrorResponse,
  Link,
  Outlet,
  type LoaderFunctionArgs,
  useRouteError,
  useLocation,
} from "react-router";

export function loader({ params }: LoaderFunctionArgs) {
  if (!params.catalogName) throw new Response("Not found", { status: 404 });
  if (!catalogsHash[params.catalogName]) throw new Response("Not found", { status: 404 });
  return null;
}

export default function CatalogPage() {
  const location = useLocation();
  return <Outlet key={location.pathname + location.search} />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (!isRouteErrorResponse(error) || error.status !== 404) throw error;
  return (
    <main className="mx-auto max-w-3xl p-6" data-testid="catalog-not-found">
      <h1>Catalog not found</h1>
      <p>The requested catalog name is not registered in the brick catalog.</p>
      <Link to="/">Return to all catalogs</Link>
    </main>
  );
}
