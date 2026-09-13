import type { Route } from "./+types/CollectionPage";
import { collectionsHash } from "@qrk.sh/bricks";
import { isRouteErrorResponse, Link, Outlet } from "react-router";

export function clientLoader({ params }: Route.ClientLoaderArgs) {
  if (!collectionsHash[params.collectionName]) throw new Response("Not found", { status: 404 });
  return null;
}

export default function CollectionPage() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (!isRouteErrorResponse(error) || error.status !== 404) throw error;
  return (
    <main className="mx-auto max-w-3xl p-6" data-testid="collection-not-found">
      <h1>Collection not found</h1>
      <p>The requested collection name is not registered in the brick catalog.</p>
      <Link to="/">Return to all collections</Link>
    </main>
  );
}
