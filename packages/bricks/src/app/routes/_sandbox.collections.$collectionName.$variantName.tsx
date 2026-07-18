import { collectionsHash } from "@qrk.sh/bricks";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { PrimitiveKind } from "@zerospin/core/models/primitiveKind";
import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { ScraperApi } from "scraper/ScraperApi";
import type { IScrapeError } from "scraper/types";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { CodeText } from "../CodeText";
import { MetadataField } from "../MetadataField";
import { useGridStore } from "../useGridStore";

export const Route = createFileRoute("/_sandbox/collections/$collectionName/$variantName")({
  component: VariantConfiguration,
  notFoundComponent: VariantNotFound,
});

function VariantConfiguration() {
  const { collectionName, variantName } = Route.useParams();
  const setActiveBrickDrag = useGridStore((state) => state.setActiveBrickDrag);
  const collection = collectionsHash[collectionName];
  const variant = collection?.variants[variantName];
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

  if (!collection || !variant) {
    throw notFound();
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
    throw notFound();
  }

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
          <div className="mt-5">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <MetadataField label="Collection name">{collection.collectionLabel}</MetadataField>
              <MetadataField label="Collection ID" className="text-right">
                <CodeText>{collection.collectionName}</CodeText>
              </MetadataField>
              <MetadataField label="Collection description" className="col-span-2">
                {collection.collectionDescription}
              </MetadataField>
            </dl>
            <hr className="my-4 border-zinc-200" />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <MetadataField label="Variant name">
                {variantName[0].toUpperCase() + variantName.slice(1)}
              </MetadataField>
              <MetadataField label="Variant ID" className="text-right">
                <CodeText>{variantName}</CodeText>
              </MetadataField>
              <MetadataField label="Variant description" className="col-span-2">
                {variant.variantDescription}
              </MetadataField>
            </dl>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-10">
          {sizes.map(([sizeName, brick]) => {
            const BrickComponent = brick.component;

            return (
              <section key={sizeName}>
                <dl className="px-6 text-sm">
                  <MetadataField label="Size">{brick.def.size}</MetadataField>
                </dl>
                <div className="mt-6 overflow-auto">
                  <div
                    className={
                      brick.def.w === 8
                        ? "qrk-bricks cursor-grab overflow-hidden active:cursor-grabbing"
                        : "qrk-bricks ml-6 cursor-grab overflow-hidden active:cursor-grabbing"
                    }
                    data-variant-size-brick={`${brick.def.collectionName}/${brick.def.variant}/${brick.def.size}`}
                    draggable
                    onDragStart={(event) => {
                      setActiveBrickDrag(brick.def);
                      event.dataTransfer.effectAllowed = "copy";
                      event.dataTransfer.setData("text/plain", brick.def.size);
                    }}
                    onDragEnd={() => {
                      setActiveBrickDrag(null);
                    }}
                    style={{
                      width: `${(brick.def.w / 8) * 100}%`,
                      aspectRatio: `${brick.def.w} / ${brick.def.h}`,
                    }}
                  >
                    {variant.defaultData === undefined ? (
                      <BrickComponent />
                    ) : (
                      <BrickComponent data={loadedData ?? variant.defaultData} />
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <div className="border-l border-zinc-200 px-6 pt-6">
        {payloadShape !== undefined && getData !== undefined ? (
          <div>
            <h2 className="m-0 text-lg font-semibold">Data</h2>
            <form
              className="mt-5 space-y-5"
              onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();

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
              <Button disabled={hasUnsupportedPayload || isLoadingData} type="submit">
                {isLoadingData ? "Getting data..." : "Get data"}
              </Button>
            </form>

            {dataError !== undefined ? (
              <div
                className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                data-testid="variant-data-error"
                role="alert"
              >
                <p className="m-0 font-mono font-semibold">{dataError.code}</p>
                <p className="mb-0 mt-2">{dataError.message}</p>
              </div>
            ) : null}

            {requestError !== undefined ? (
              <div
                className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                data-testid="variant-request-error"
                role="alert"
              >
                {requestError}
              </div>
            ) : null}

            <pre
              className="mt-5 overflow-auto bg-zinc-100 p-4 text-xs"
              data-testid="variant-data-result"
            >
              {JSON.stringify(loadedData ?? variant.defaultData, null, 2)}
            </pre>
          </div>
        ) : (
          <pre className="m-0 overflow-auto bg-zinc-100 p-4 text-xs">
            {JSON.stringify(variant, null, 2)}
          </pre>
        )}
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
