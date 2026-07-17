import { collectionsHash } from "@qrk.sh/bricks";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";

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
    <main className="mx-auto max-w-7xl p-6">
      <Link to="/" className="text-sm text-zinc-600">
        All collections
      </Link>
      <h1 className="mb-1 mt-5 text-4xl font-semibold tracking-tight">
        {collection.collectionLabel}
      </h1>
      <p className="mt-0 font-mono text-sm text-zinc-500">{collection.collectionName}</p>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        {bricks.map((brick) => {
          const BrickComponent = brick.component;
          const previewUnitPx = 48;

          return (
            <Link
              key={brick.def.name}
              to="/bricks/$collectionName/$brickName"
              params={{
                collectionName: brick.def.collectionName,
                brickName: brick.def.name,
              }}
              data-brick-link={`${brick.def.collectionName}/${brick.def.name}`}
              className="rounded-xl border border-zinc-300 bg-white p-5 no-underline"
            >
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <div>
                  <h2 className="m-0 text-lg font-semibold">{brick.def.label}</h2>
                  <p className="mb-0 mt-1 font-mono text-xs text-zinc-500">{brick.def.name}</p>
                </div>
                <span className="text-sm text-zinc-500">
                  {brick.def.w} × {brick.def.h}
                </span>
              </div>
              <div className="overflow-auto rounded-lg bg-zinc-100 p-4">
                <div
                  className="qrk-bricks overflow-hidden"
                  style={{
                    width: brick.def.w * previewUnitPx,
                    height: brick.def.h * previewUnitPx,
                  }}
                >
                  <BrickComponent />
                </div>
              </div>
            </Link>
          );
        })}
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
