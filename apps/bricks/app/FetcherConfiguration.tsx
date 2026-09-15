import { useEffect, useRef, useState } from "react";

import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { PrimitiveKind } from "@zerospin/schema";
import "react-json-view-lite/dist/index.css";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";

import type { IFetcherConfiguration } from "../makeFetcherConfiguration";
import { Outline } from "../components/outline/Outline";
import type { ScraperApi } from "../scraper/ScraperApi.public";
import type { IScrapeError } from "../scraper/types.public";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

export function FetcherConfiguration(props: {
  configuration: IFetcherConfiguration;
  groupName: string | undefined;
  data: unknown;
  showData?: boolean;
  setData: (data: unknown) => void;
}) {
  const {
    catalogOptionsShape,
    catalogOptionsForm: CatalogOptionsForm,
    fetcher: fetchData,
  } = props.configuration;
  const [catalogOptionsValues, setCatalogOptionsValues] = useState<Record<string, unknown>>(() => {
    const initialCatalogOptionsValues: Record<string, unknown> = {};

    // Initialize the complete catalog options from the declared field defaults.
    for (const [fieldName, descriptor] of Object.entries(catalogOptionsShape)) {
      initialCatalogOptionsValues[fieldName] =
        "defaultValue" in descriptor ? descriptor.defaultValue : undefined;
    }
    return initialCatalogOptionsValues;
  });
  const currentCatalogOptions = useRef(catalogOptionsValues);
  const generation = useRef(0);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<IScrapeError>();
  const [requestError, setRequestError] = useState<string>();
  const hasUnsupportedCatalogOptions =
    CatalogOptionsForm === undefined &&
    Object.entries(catalogOptionsShape).some(
      ([, descriptor]) =>
        descriptor.kind !== PrimitiveKind.Text ||
        descriptor.nullable !== false ||
        typeof descriptor.defaultValue !== "string",
    );

  useEffect(
    () => () => {
      // Outstanding RPC sessions still dispose when they settle, but cannot publish.
      generation.current += 1;
    },
    [],
  );

  async function onCatalogOptionsChange(catalogOptions: Record<string, unknown>) {
    // Snapshot the next complete catalog options synchronously, including batched changes.
    currentCatalogOptions.current = catalogOptions;
    setCatalogOptionsValues(catalogOptions);
    const requestGeneration = ++generation.current;
    setDataError(undefined);
    setRequestError(undefined);

    if (hasUnsupportedCatalogOptions) return;
    setIsLoadingData(true);
    try {
      using api = newSyncRpcSession<ScraperApi>("/scraper-rpc");
      const result = await fetchData({
        api,
        catalogOptions,
        setData: (data) => {
          if (generation.current === requestGeneration) props.setData(data);
        },
      });
      if (generation.current === requestGeneration && result._tag === "Left") {
        setDataError(result.left);
      }
    } catch (cause) {
      if (generation.current === requestGeneration) {
        setRequestError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (generation.current === requestGeneration) setIsLoadingData(false);
    }
  }

  return (
    <div>
      <Outline.Title>Configuration</Outline.Title>
      {props.showData !== false && (
        <div className="overflow-auto bg-zinc-100 px-2 py-4" data-testid="catalog-data-result">
          <JsonView
            shouldExpandNode={collapseAllNested}
            data={{ data: props.data }}
            style={{ ...defaultStyles, container: "bg-zinc-100" }}
          />
        </div>
      )}

      <div className="px-4 py-5">
        <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
          {CatalogOptionsForm !== undefined ? (
            <CatalogOptionsForm
              value={catalogOptionsValues}
              onChange={(value) => {
                void onCatalogOptionsChange(value);
              }}
            />
          ) : (
            Object.entries(catalogOptionsShape).map(([fieldName, descriptor]) => {
              if (
                descriptor.kind !== PrimitiveKind.Text ||
                descriptor.nullable !== false ||
                typeof descriptor.defaultValue !== "string"
              ) {
                return (
                  <p
                    className="m-0 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                    data-testid={`unsupported-catalog-options-${fieldName}`}
                    key={fieldName}
                    role="alert"
                  >
                    Unsupported catalog options field &quot;{fieldName}
                    &quot;: only non-null text primitives with string defaults are supported.
                  </p>
                );
              }

              return (
                <div className="flex flex-col items-start gap-2" key={fieldName}>
                  <label
                    className="block text-sm font-medium"
                    htmlFor={`catalog-options-${fieldName}`}
                  >
                    {fieldName === "url" ? "URL" : fieldName}
                  </label>
                  <Input
                    className="mb-1"
                    id={`catalog-options-${fieldName}`}
                    name={fieldName}
                    onChange={(event) => {
                      const catalogOptions = {
                        ...currentCatalogOptions.current,
                        [fieldName]: event.target.value,
                      };
                      currentCatalogOptions.current = catalogOptions;
                      setCatalogOptionsValues(catalogOptions);
                    }}
                    type="text"
                    value={
                      typeof catalogOptionsValues[fieldName] === "string"
                        ? catalogOptionsValues[fieldName]
                        : descriptor.defaultValue
                    }
                  />
                  <Button
                    type="button"
                    disabled={isLoadingData || hasUnsupportedCatalogOptions}
                    onClick={() => {
                      void onCatalogOptionsChange(currentCatalogOptions.current);
                    }}
                  >
                    Submit
                  </Button>
                </div>
              );
            })
          )}
        </form>

        {isLoadingData ? <p role="status">Getting data...</p> : null}

        {dataError !== undefined ? (
          <div
            className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            data-testid="catalog-data-error"
            role="alert"
          >
            <p className="m-0 font-mono font-semibold">{dataError.code}</p>
            <p className="mb-0 mt-2">{dataError.message}</p>
          </div>
        ) : null}

        {requestError !== undefined ? (
          <div
            className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            data-testid="catalog-request-error"
            role="alert"
          >
            {requestError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
