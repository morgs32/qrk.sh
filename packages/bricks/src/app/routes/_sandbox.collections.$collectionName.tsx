import { collectionsHash } from "@qrk.sh/bricks";
import { Link, Outlet, createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/_sandbox/collections/$collectionName")({
  loader: ({ params }) => {
    const collection = Object.values(collectionsHash).find(
      (candidate) => candidate.collectionName === params.collectionName,
    );

    if (!collection) {
      throw notFound();
    }

    return collection.collectionName;
  },
  component: CollectionPage,
  notFoundComponent: CollectionNotFound,
});

function CollectionPage() {
  Route.useLoaderData();

  return <Outlet />;
}

function CollectionNotFound() {
  return (
    <main className="mx-auto max-w-3xl p-6" data-testid="collection-not-found">
      <h1>Collection not found</h1>
      <p>The requested collection name is not registered in the brick catalog.</p>
      <Link to="/">Return to all collections</Link>
    </main>
  );
}
