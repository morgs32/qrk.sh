import { collectionsHash } from "../../collectionsHash";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { makeEffectSchema } from "@zerospin/schema";
import { Schema } from "effect";
import { Configuration } from "../Configuration";

import { OrderedTableOfContents } from "../../OrderedTableOfContents";

import { useGridStore } from "../useGridStore";

export default function BrickDetail() {
  const params = useParams();
  if (!params.collectionName || !params.brickId) throw new Response("Not found", { status: 404 });
  const { collectionName, brickId } = params;
  const hasHydrated = useGridStore((state) => state.hasHydrated);
  const brickDef = useGridStore((state) => state.bricksById[brickId]);
  const collection =
    brickDef?.collectionName === collectionName
      ? collectionsHash[brickDef.collectionName]
      : undefined;
  const variant = collection?.variants[brickDef?.variant ?? ""];
  const brick = variant?.layouts[brickDef?.layout ?? ""];

  if (!hasHydrated) {
    return <div className="px-6 pt-6 text-sm text-zinc-500">Loading brick…</div>;
  }

  if (!brick || !collection || !variant || !brickDef) {
    return (
      <div className="px-6 pt-6" data-testid="brick-not-found">
        <Link
          to={`/collections/${encodeURIComponent(collectionName)}`}
          className="inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft aria-hidden className="size-4" />
          <span>Back to collection</span>
        </Link>
        <h1 className="mb-2 mt-8 text-4xl font-semibold tracking-tight">Brick not found</h1>
        <p className="mt-0 text-zinc-600">
          This brick ID is not stored for the requested collection.
        </p>
      </div>
    );
  }

  const BrickComponent = brick.component;
  const brickData = brickDef.data;

  return (
    <section data-testid="brick-detail-pane">
      <OrderedTableOfContents.Section>
        <OrderedTableOfContents.List padded={false}>
          <OrderedTableOfContents.Item>
            <OrderedTableOfContents.Label>
              <Link to={`/collections/${encodeURIComponent(collectionName)}`}>
                {collection.collectionLabel}
              </Link>
            </OrderedTableOfContents.Label>
            <div className="pt-2">
              <OrderedTableOfContents.List padded={false} spaced>
                {Object.entries(collection.variants).map(([name, option]) => (
                  <OrderedTableOfContents.Item key={name}>
                    <OrderedTableOfContents.Label>
                      <Link
                        to={`/collections/${encodeURIComponent(collectionName)}?variant=${encodeURIComponent(name)}`}
                        aria-current={name === brick.def.variant ? "true" : undefined}
                        className="underline aria-[current=true]:no-underline"
                      >
                        {option.variantName}
                      </Link>
                    </OrderedTableOfContents.Label>
                    <div className="pt-2">
                      <OrderedTableOfContents.List padded={false}>
                        {Object.entries(option.layouts).map(([layout, optionBrick]) => (
                          <OrderedTableOfContents.Item key={layout}>
                            <OrderedTableOfContents.Label>
                              <span
                                aria-current={
                                  name === brick.def.variant && layout === brick.def.layout ? "true" : undefined
                                }
                                aria-disabled={
                                  name !== brick.def.variant || layout !== brick.def.layout
                                }
                                className="text-zinc-400 aria-[current=true]:font-semibold aria-[current=true]:text-zinc-900"
                              >
                                {optionBrick.def.label}
                              </span>
                            </OrderedTableOfContents.Label>
                          </OrderedTableOfContents.Item>
                        ))}
                      </OrderedTableOfContents.List>
                    </div>
                  </OrderedTableOfContents.Item>
                ))}
              </OrderedTableOfContents.List>
            </div>
          </OrderedTableOfContents.Item>
        </OrderedTableOfContents.List>
      </OrderedTableOfContents.Section>
      <OrderedTableOfContents.Preview>
        <div
          className="qrk-bricks overflow-hidden"
          data-testid="selected-brick-preview"
          style={{
            width: `${(brick.def.w / 8) * 100}%`,
            aspectRatio: `${brick.def.w} / ${brick.def.h}`,
          }}
        >
          <BrickComponent data={brickData} />
        </div>
      </OrderedTableOfContents.Preview>
      <div className="pb-6">
        <Configuration
          key={brickId}
          variant={variant}
          data={brickData}
          setData={(data) => {
            const DataSchema = variant.dataShape === null
              ? Schema.Null
              : Schema.toType(makeEffectSchema(variant.dataShape));
            const decodedData = Schema.decodeUnknownSync(DataSchema)(data, {
              onExcessProperty: "preserve",
            });
            useGridStore.setState((state) => ({
              bricksById: {
                ...state.bricksById,
                [brickId]: { ...state.bricksById[brickId], data: decodedData },
              },
            }));
          }}
        />
      </div>
    </section>
  );
}
