import { collectionsHash } from "@qrk.sh/bricks";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { LeadingRow } from "../LeadingRow";

export const Route = createFileRoute("/_sandbox/collections/$collectionName/$variantName")({
  component: VariantConfiguration,
  notFoundComponent: VariantNotFound,
});

function VariantConfiguration() {
  const { collectionName, variantName } = Route.useParams();
  const collection = collectionsHash[collectionName];
  const variant = collection?.variants[variantName];

  if (!collection || !variant) {
    throw notFound();
  }

  return (
    <section data-testid="variant-configuration-pane">
      <div className="px-6 pt-6">
        <Link
          to="/collections/$collectionName"
          params={{ collectionName }}
          className="inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft aria-hidden className="size-4" />
          <span>Back to {collection.collectionLabel}</span>
        </Link>
        <dl className="mt-5 space-y-3 text-sm">
          <LeadingRow label="Collection name" value={collection.collectionLabel} />
          <LeadingRow label="Collection ID" value={collection.collectionName} />
          <LeadingRow
            label="Variant name"
            value={variantName[0].toUpperCase() + variantName.slice(1)}
          />
          <LeadingRow label="Variant ID" value={variantName} />
        </dl>
      </div>
      <pre className="mx-6 mt-8 overflow-auto bg-zinc-100 p-4 text-xs">
        {JSON.stringify(variant, null, 2)}
      </pre>
    </section>
  );
}

function VariantNotFound() {
  const { collectionName } = Route.useParams();

  return (
    <div className="px-6 pt-6" data-testid="variant-not-found">
      <Link
        to="/collections/$collectionName"
        params={{ collectionName }}
        className="inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft aria-hidden className="size-4" />
        <span>Back to collection</span>
      </Link>
      <h1 className="mb-2 mt-8 text-4xl font-semibold tracking-tight">Variant not found</h1>
      <p className="mt-0 text-zinc-600">This variant is not registered in the collection.</p>
    </div>
  );
}
