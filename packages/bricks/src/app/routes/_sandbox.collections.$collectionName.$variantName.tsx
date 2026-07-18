import { collectionsHash } from "@qrk.sh/bricks";
import { Tabs } from "@base-ui/react/tabs";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { LeadingRow } from "../LeadingRow";
import { useGridStore } from "../useGridStore";

export const Route = createFileRoute("/_sandbox/collections/$collectionName/$variantName")({
  component: VariantConfiguration,
  notFoundComponent: VariantNotFound,
});

function VariantConfiguration() {
  const { collectionName, variantName } = Route.useParams();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);
  const collection = collectionsHash[collectionName];
  const variant = collection?.variants[variantName];

  if (!collection || !variant) {
    throw notFound();
  }

  const sizes = Object.entries(variant.sizes);
  const firstSize = sizes[0];

  if (!firstSize) {
    throw notFound();
  }

  const [firstSizeName, firstBrick] = firstSize;
  const selectedSizeName = selectedSize ?? firstSizeName;
  const selectedBrick = variant.sizes[selectedSizeName] ?? firstBrick;
  const BrickComponent = selectedBrick.component;

  return (
    <section
      className="grid min-h-screen md:grid-cols-2"
      data-full-width-pane
      data-testid="variant-configuration-pane"
    >
      <div>
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
        <section className="mt-8">
          <div className="flex items-start justify-between gap-4 px-6">
            <div>
              <h1 className="m-0 text-2xl font-semibold">{variantName}</h1>
              <p className="mb-0 mt-1 text-sm text-zinc-500">{variant.variantDescription}</p>
            </div>
            <Tabs.Root value={selectedSizeName}>
              <Tabs.List aria-label={`${variantName} sizes`} className="flex gap-2 text-sm">
                {sizes.map(([sizeName, brick]) => (
                  <Tabs.Tab
                    key={sizeName}
                    value={sizeName}
                    onClick={() => {
                      setSelectedSize(sizeName);
                    }}
                    className={(state) =>
                      state.active
                        ? "cursor-pointer border-0 bg-transparent p-0 font-medium text-zinc-950 no-underline"
                        : "cursor-pointer border-0 bg-transparent p-0 text-zinc-500 underline underline-offset-2"
                    }
                  >
                    {brick.def.size}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.Root>
          </div>
          <div className="mt-6 overflow-auto">
            <div
              className={
                selectedBrick.def.w === 8
                  ? "qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                  : "qrk-bricks ml-6 cursor-grab overflow-hidden active:cursor-grabbing"
              }
              data-variant-selected-brick={`${selectedBrick.def.collectionName}/${selectedBrick.def.variant}/${selectedBrick.def.size}`}
              draggable
              onDragStart={(event) => {
                setActiveBrickDrag(selectedBrick.def);
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData("text/plain", selectedBrick.def.size);
              }}
              onDragEnd={() => {
                setActiveBrickDrag(null);
              }}
              style={{
                width: `${(selectedBrick.def.w / 8) * 100}%`,
                aspectRatio: `${selectedBrick.def.w} / ${selectedBrick.def.h}`,
              }}
            >
              <BrickComponent />
            </div>
          </div>
        </section>
      </div>
      <div className="px-6 pt-6">
        <pre className="m-0 overflow-auto bg-zinc-100 p-4 text-xs">
          {JSON.stringify(variant, null, 2)}
        </pre>
      </div>
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
