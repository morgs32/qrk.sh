import { collectionsHash } from "@qrk.sh/bricks";
import { Link, Outlet, createFileRoute, notFound } from "@tanstack/react-router";

import { SandboxGrid } from "../SandboxGrid";

export const Route = createFileRoute("/collections/$collectionName")({
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

  return (
    <main className="min-h-screen">
      <div className="grid min-h-screen md:grid-cols-2">
        <section className="border-b border-zinc-300 pb-6 md:border-b-0 md:border-r md:pb-0">
          <Outlet />
        </section>
        <SandboxGrid />
      </div>
    </main>
  );
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
