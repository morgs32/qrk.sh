import { collectionsHash } from "@qrk.sh/bricks";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: CatalogPage });

function CatalogPage() {
  const collections = Object.values(collectionsHash);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-8">
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.18em] text-zinc-500">
          Development sandbox
        </p>
        <h1 className="m-0 text-4xl font-semibold tracking-tight">Brick collections</h1>
        <p className="mt-3 max-w-2xl text-zinc-600">
          Open a collection, then use a brick&apos;s two-part catalog identity for a stable
          development URL.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((collection) => (
          <Link
            key={collection.collectionName}
            to="/collections/$collectionName"
            params={{ collectionName: collection.collectionName }}
            data-collection-link={collection.collectionName}
            className="rounded-xl border border-zinc-300 bg-white p-5 no-underline transition hover:border-zinc-500"
          >
            <h2 className="m-0 text-xl font-semibold">{collection.collectionLabel}</h2>
            <p className="mb-0 mt-2 font-mono text-sm text-zinc-500">{collection.collectionName}</p>
            <p className="mb-0 mt-4 text-sm text-zinc-600">
              {Object.keys(collection.bricks).length} variants
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
