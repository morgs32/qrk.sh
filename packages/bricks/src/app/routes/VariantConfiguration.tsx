import { GripHorizontal } from "lucide-react";
import { Button } from "../../ui/button";
import { collectionsHash } from "../../collectionsHash";
import {
  isRouteErrorResponse,
  Link,
  useParams,
  useSearchParams,
  type LoaderFunctionArgs,
  useRouteError,
} from "react-router";
import { ArrowLeft } from "lucide-react";

import { OrderedTableOfContents } from "../../OrderedTableOfContents";
import { TableData } from "../../TableData";
import { Configuration } from "../Configuration";
import { useVariantData } from "../useVariantData";
import { useGridStore } from "../useGridStore";

export function loader({ params }: LoaderFunctionArgs) {
  if (!params.collectionName || !params.variantName)
    throw new Response("Not found", { status: 404 });
  const variant = collectionsHash[params.collectionName]?.variants[params.variantName];
  if (!variant || Object.keys(variant.layouts).length === 0) {
    throw new Response("Not found", { status: 404 });
  }
  return null;
}

export default function VariantConfiguration() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  if (!params.collectionName) throw new Response("Not found", { status: 404 });
  const { collectionName } = params;
  const variantName =
    params.variantName ??
    searchParams.get("variant") ??
    Object.keys(collectionsHash[collectionName]?.variants ?? {})[0];
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);
  const collection = collectionsHash[collectionName];
  const variant = variantName ? collection?.variants[variantName] : undefined;

  if (!collection || !variant || !variantName) {
    throw new Response("Not found", { status: 404 });
  }

  const [variantData, setVariantData] = useVariantData(collectionName, variantName);
  const layouts = Object.entries(variant.layouts);
  const firstLayout = layouts[0];

  if (!firstLayout) {
    throw new Response("Not found", { status: 404 });
  }

  const layoutName = searchParams.get("layout") ?? firstLayout[0];
  const brick = variant.layouts[layoutName];
  if (!brick) throw new Response("Not found", { status: 404 });
  const BrickComponent = brick.component;

  return (
    <section data-testid="variant-configuration-pane">
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
                        aria-current={name === variantName ? "true" : undefined}
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
                              <Link
                                to={`/collections/${encodeURIComponent(collectionName)}?variant=${encodeURIComponent(name)}&layout=${encodeURIComponent(layout)}`}
                                aria-current={
                                  name === variantName && layout === layoutName ? "true" : undefined
                                }
                                className="underline aria-[current=true]:font-bold aria-[current=true]:text-zinc-950! aria-[current=true]:no-underline!"
                              >
                                {optionBrick.def.label}
                              </Link>
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
      <div className="pt-6">
        <TableData
          entries={[
            { label: "Collection name", value: collection.collectionLabel },
            { label: "Collection ID", value: collection.collectionName },
            { label: "Collection description", value: collection.collectionDescription },
            { label: "Variant name", value: variant.variantName },
            { label: "Variant ID", value: variantName },
            { label: "Variant description", value: variant.variantDescription },
          ]}
        />
      </div>
      <div className="sticky top-0 z-10 overflow-auto bg-white py-6">
        <div
          className={
            brick.def.w === 8
              ? "qrk-bricks brick-drag-surface overflow-hidden"
              : "qrk-bricks ml-6 brick-drag-surface overflow-hidden"
          }
          data-variant-layout-brick={`${collectionName}/${variantName}/${layoutName}`}
          style={{
            width: `${(brick.def.w / 8) * 100}%`,
            aspectRatio: `${brick.def.w} / ${brick.def.h}`,
            clipPath: "inset(0)",
          }}
        >
          <div className="brick-drag-content size-full select-none">
            <BrickComponent data={variantData} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="brick-drag-handle"
            aria-label="Drag brick"
            draggable
            onDragStart={(event) => {
              setActiveBrickDrag({ ...brick.def, data: structuredClone(variantData) });
              const surface = event.currentTarget.parentElement;
              if (surface) {
                const bounds = surface.getBoundingClientRect();
                event.dataTransfer.setDragImage(
                  surface,
                  event.clientX - bounds.left,
                  event.clientY - bounds.top,
                );
              }
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData("text/plain", brick.def.layout);
            }}
            onDragEnd={() => setActiveBrickDrag(null)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <GripHorizontal aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
      <div className="pb-6">
        <Configuration variant={variant} data={variantData} setData={setVariantData} />
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const params = useParams();
  if (!isRouteErrorResponse(error) || error.status !== 404) throw error;
  const collectionName = params.collectionName ?? "";

  return (
    <div className="px-6 pt-6" data-testid="variant-not-found">
      <Link
        to={`/collections/${encodeURIComponent(collectionName)}`}
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
