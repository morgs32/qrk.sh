import { collectionsHash } from "@qrk.sh/bricks";
import {
  isRouteErrorResponse,
  Link,
  Outlet,
  type LoaderFunctionArgs,
  useRouteError,
  useLocation,
} from "react-router";

export function loader({ params }: LoaderFunctionArgs) {
  if (!params.collectionName) throw new Response("Not found", { status: 404 });
  if (!collectionsHash[params.collectionName]) throw new Response("Not found", { status: 404 });
  return null;
}

export default function CollectionPage() {
  const location = useLocation();
  return <Outlet key={location.pathname + location.search} />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (!isRouteErrorResponse(error) || error.status !== 404) throw error;
  return (
    <main className="mx-auto max-w-3xl p-6" data-testid="collection-not-found">
      <h1>Collection not found</h1>
      <p>The requested collection name is not registered in the brick catalog.</p>
      <Link to="/">Return to all collections</Link>
    </main>
  );
}
