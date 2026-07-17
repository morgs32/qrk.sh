import { collectionsHash } from "@qrk.sh/bricks";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

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
  const collectionName = Route.useLoaderData();
  const collection = Object.values(collectionsHash).find(
    (candidate) => candidate.collectionName === collectionName,
  );

  if (!collection) {
    throw notFound();
  }

  const bricks = Object.values(collection.bricks);

  return (
    <main className="min-h-screen">
      <div className="grid min-h-screen md:grid-cols-2">
        <section className="border-b border-zinc-300 pb-6 md:border-b-0 md:border-r md:pb-0">
          <div className="px-6 pt-6">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-600">
              <ArrowLeft aria-hidden className="size-4" />
              <span>All collections</span>
            </Link>
            <h1 className="mb-1 mt-5 text-4xl font-semibold tracking-tight">
              {collection.collectionLabel}
            </h1>
            <p className="mt-0 font-mono text-sm text-zinc-500">{collection.collectionName}</p>
          </div>
          <div className="mt-8 flex flex-col gap-10">
            {bricks.map((brick) => {
              const BrickComponent = brick.component;

              return (
                <section key={brick.def.name}>
                  <h2 className="m-0 px-6 text-2xl font-semibold">{brick.def.label}</h2>
                  <div className="mt-6 overflow-auto">
                    <div
                      className="qrk-bricks overflow-hidden"
                      data-brick-full-size={`${brick.def.collectionName}/${brick.def.name}`}
                      style={{
                        width: `${(brick.def.w / 8) * 100}%`,
                        aspectRatio: `${brick.def.w} / ${brick.def.h}`,
                      }}
                    >
                      <BrickComponent />
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </section>

        <section aria-label="Empty canvas" />
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
