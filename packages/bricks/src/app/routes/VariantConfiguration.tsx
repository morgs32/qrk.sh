import { collectionsHash } from "@qrk.sh/bricks";
import {
  isRouteErrorResponse,
  Link,
  useParams,
  useSearchParams,
  type LoaderFunctionArgs,
  useRouteError,
} from "react-router";
import { PrimitiveKind } from "@zerospin/schema";
import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import { ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { ScraperApi } from "scraper/ScraperApi";
import type { IScrapeError } from "scraper/types";

import { OrderedTableOfContents } from "../../OrderedTableOfContents";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { TableData } from "../../TableData";
import { useGridStore } from "../useGridStore";

export function loader({ params }: LoaderFunctionArgs) {
  if (!params.collectionName || !params.variantName)
    throw new Response("Not found", { status: 404 });
  const variant = collectionsHash[params.collectionName]?.variants[params.variantName];
  if (!variant || Object.keys(variant.sizes).length === 0) {
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
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [loadedData, setLoadedData] = useState<unknown>();
  const [dataError, setDataError] = useState<IScrapeError>();
  const [requestError, setRequestError] = useState<string>();
  const [payloadValues, setPayloadValues] = useState<Record<string, unknown>>(() => {
    const initialPayloadValues: Record<string, unknown> = {};

    if (variant?.payloadShape === undefined) {
      return initialPayloadValues;
    }

    // Build one controlled value for every declared payload field. Custom
    // renderers are type-rejected when their descriptor has no default, so the
    // workbench never invents an undefined value for those controls.
    for (const [fieldName, descriptor] of Object.entries(variant.payloadShape)) {
      initialPayloadValues[fieldName] =
        "defaultValue" in descriptor ? descriptor.defaultValue : undefined;
    }

    return initialPayloadValues;
  });

  if (!collection || !variant || !variantName) {
    throw new Response("Not found", { status: 404 });
  }

  const sizes = Object.entries(variant.sizes);
  const firstSize = sizes[0];
  const payloadShape = variant.payloadShape;
  const payloadForm = variant.payloadForm;
  const getData = variant.getData;
  const payloadEntries = payloadShape === undefined ? [] : Object.entries(payloadShape);
  const hasUnsupportedPayload = payloadEntries.some(([fieldName, descriptor]) => {
    if (payloadForm?.[fieldName] !== undefined) {
      return false;
    }

    return (
      descriptor.kind !== PrimitiveKind.Text ||
      descriptor.nullable !== false ||
      typeof descriptor.defaultValue !== "string"
    );
  });

  if (!firstSize) {
    throw new Response("Not found", { status: 404 });
  }

  const sizeName = searchParams.get("size") ?? firstSize[0];
  const brick = variant.sizes[sizeName];
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
                        {option.variantLabel}
                      </Link>
                    </OrderedTableOfContents.Label>
                    <div className="pt-2">
                      <OrderedTableOfContents.List padded={false}>
                        {Object.entries(option.sizes).map(([size, optionBrick]) => (
                          <OrderedTableOfContents.Item key={size}>
                            <OrderedTableOfContents.Label>
                              <Link
                                to={`/collections/${encodeURIComponent(collectionName)}?variant=${encodeURIComponent(name)}&size=${encodeURIComponent(size)}`}
                                aria-current={
                                  name === variantName && size === sizeName ? "true" : undefined
                                }
                                className="underline aria-[current=true]:no-underline"
                              >
                                {optionBrick.def.size}
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
            { label: "Variant name", value: variant.variantLabel },
            { label: "Variant ID", value: variantName },
            { label: "Variant description", value: variant.variantDescription },
          ]}
        />
      </div>
      <OrderedTableOfContents.Preview>
        <div
          className={
            brick.def.w === 8
              ? "qrk-bricks cursor-grab overflow-hidden"
              : "qrk-bricks ml-6 cursor-grab overflow-hidden"
          }
          data-variant-size-brick={`${collectionName}/${variantName}/${sizeName}`}
          draggable
          onDragStart={(event) => {
            setActiveBrickDrag(brick.def);
            event.dataTransfer.effectAllowed = "copy";
            event.dataTransfer.setData("text/plain", brick.def.size);
          }}
          onDragEnd={() => setActiveBrickDrag(null)}
          style={{
            width: `${(brick.def.w / 8) * 100}%`,
            aspectRatio: `${brick.def.w} / ${brick.def.h}`,
          }}
        >
          <div inert className="pointer-events-none contents select-none">
            {variant.defaultData === undefined ? (
              <BrickComponent />
            ) : (
              <BrickComponent data={loadedData ?? variant.defaultData} />
            )}
          </div>
        </div>
      </OrderedTableOfContents.Preview>
      <div className="px-6 py-6">
        {payloadShape !== undefined ? (
          <div>
            <h2 className="m-0 text-lg font-semibold">
              {getData === undefined ? "Content" : "Data"}
            </h2>
            <form
              className="mt-5 space-y-5"
              onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();

                if (getData === undefined) {
                  return;
                }

                setIsLoadingData(true);
                setDataError(undefined);
                setRequestError(undefined);

                try {
                  using api = newSyncRpcSession<ScraperApi>("/scraper-rpc");
                  const result = await getData({
                    api,
                    payload: payloadValues,
                  });

                  if (result._tag === "Left") {
                    setDataError(result.left);
                  } else {
                    setLoadedData(result.right);
                  }
                } catch (cause) {
                  setRequestError(cause instanceof Error ? cause.message : String(cause));
                } finally {
                  setIsLoadingData(false);
                }
              }}
            >
              {Object.entries(payloadShape).map(([fieldName, descriptor]) => {
                const PayloadField = payloadForm?.[fieldName];

                if (PayloadField !== undefined) {
                  return (
                    <div className="space-y-2" key={fieldName}>
                      <label className="block text-sm font-medium">{fieldName}</label>
                      <PayloadField
                        value={payloadValues[fieldName]}
                        onChange={(value: unknown) => {
                          setPayloadValues((currentPayloadValues) => ({
                            ...currentPayloadValues,
                            [fieldName]: value,
                          }));
                        }}
                      />
                    </div>
                  );
                }

                if (
                  descriptor.kind !== PrimitiveKind.Text ||
                  descriptor.nullable !== false ||
                  typeof descriptor.defaultValue !== "string"
                ) {
                  return (
                    <p
                      className="m-0 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                      data-testid={`unsupported-payload-${fieldName}`}
                      key={fieldName}
                      role="alert"
                    >
                      Unsupported payload field &quot;{fieldName}&quot;: only non-null text
                      primitives with string defaults are supported.
                    </p>
                  );
                }

                return (
                  <div className="space-y-2" key={fieldName}>
                    <label className="block text-sm font-medium" htmlFor={`payload-${fieldName}`}>
                      {fieldName}
                    </label>
                    <Input
                      id={`payload-${fieldName}`}
                      name={fieldName}
                      onChange={(event) => {
                        setPayloadValues((currentPayloadValues) => ({
                          ...currentPayloadValues,
                          [fieldName]: event.target.value,
                        }));
                      }}
                      type="text"
                      value={
                        typeof payloadValues[fieldName] === "string"
                          ? payloadValues[fieldName]
                          : descriptor.defaultValue
                      }
                    />
                  </div>
                );
              })}
              {getData === undefined ? null : (
                <Button disabled={hasUnsupportedPayload || isLoadingData} type="submit">
                  {isLoadingData ? "Getting data..." : "Get data"}
                </Button>
              )}
            </form>

            {getData !== undefined && dataError !== undefined ? (
              <div
                className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                data-testid="variant-data-error"
                role="alert"
              >
                <p className="m-0 font-mono font-semibold">{dataError.code}</p>
                <p className="mb-0 mt-2">{dataError.message}</p>
              </div>
            ) : null}

            {getData !== undefined && requestError !== undefined ? (
              <div
                className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                data-testid="variant-request-error"
                role="alert"
              >
                {requestError}
              </div>
            ) : null}

            {getData === undefined ? (
              <div className="mt-5 overflow-auto" data-testid="variant-payload-result">
                <JsonView data={payloadValues} />
              </div>
            ) : (
              <div className="mt-5 overflow-auto" data-testid="variant-data-result">
                <JsonView data={{ data: loadedData ?? variant.defaultData }} />
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-auto text-xs">
            <JsonView data={variant} />
          </div>
        )}
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
