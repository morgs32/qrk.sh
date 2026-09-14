import { PrimitiveKind } from "@zerospin/schema";
import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import { useEffect, useRef, useState } from "react";
import type { ScraperApi } from "../scraper/ScraperApi.public";
import type { IScrapeError } from "../scraper/types.public";
import type { IFetcherConfiguration } from "../makeFetcherConfiguration";
import { Outline } from "../Outline";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

export function FetcherConfiguration(props: {
  configuration: IFetcherConfiguration;
  collectionName: string | undefined;
  data: unknown;
  setData: (data: unknown) => void;
}) {
  const {
    contentOptionsShape,
    contentOptionsForm: ContentOptionsForm,
    fetcher: fetchData,
  } = props.configuration;
  const [contentOptionsValues, setContentOptionsValues] = useState<Record<string, unknown>>(() => {
    const initialContentOptionsValues: Record<string, unknown> = {};

    // Initialize the complete content options from the declared field defaults.
    for (const [fieldName, descriptor] of Object.entries(contentOptionsShape)) {
      initialContentOptionsValues[fieldName] =
        "defaultValue" in descriptor ? descriptor.defaultValue : undefined;
    }
    return initialContentOptionsValues;
  });
  const currentContentOptions = useRef(contentOptionsValues);
  const generation = useRef(0);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<IScrapeError>();
  const [requestError, setRequestError] = useState<string>();
  const hasUnsupportedContentOptions =
    ContentOptionsForm === undefined &&
    Object.entries(contentOptionsShape).some(
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

  async function onContentOptionsChange(contentOptions: Record<string, unknown>) {
    // Snapshot the next complete content options synchronously, including batched changes.
    currentContentOptions.current = contentOptions;
    setContentOptionsValues(contentOptions);
    const requestGeneration = ++generation.current;
    setDataError(undefined);
    setRequestError(undefined);

    if (hasUnsupportedContentOptions) return;
    setIsLoadingData(true);
    try {
      using api = newSyncRpcSession<ScraperApi>("/scraper-rpc");
      const result = await fetchData({
        api,
        contentOptions,
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
      <Outline.Title>Configure</Outline.Title>
      <div className="overflow-auto bg-zinc-100 px-2 py-4" data-testid="content-data-result">
        <JsonView
          shouldExpandNode={collapseAllNested}
          data={{ data: props.data }}
          style={{ ...defaultStyles, container: "bg-zinc-100" }}
        />
      </div>

      <div className="px-6">
        <form className="mt-5 space-y-5" onSubmit={(event) => event.preventDefault()}>
          {ContentOptionsForm !== undefined ? (
            <ContentOptionsForm
              value={contentOptionsValues}
              onChange={(value) => {
                void onContentOptionsChange(value);
              }}
            />
          ) : (
            Object.entries(contentOptionsShape).map(([fieldName, descriptor]) => {
              if (
                descriptor.kind !== PrimitiveKind.Text ||
                descriptor.nullable !== false ||
                typeof descriptor.defaultValue !== "string"
              ) {
                return (
                  <p
                    className="m-0 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                    data-testid={`unsupported-content-options-${fieldName}`}
                    key={fieldName}
                    role="alert"
                  >
                    Unsupported content options field &quot;{fieldName}&quot;: only non-null text
                    primitives with string defaults are supported.
                  </p>
                );
              }

              return (
                <div className="flex flex-col items-start gap-2" key={fieldName}>
                  <label
                    className="block text-sm font-medium"
                    htmlFor={`content-options-${fieldName}`}
                  >
                    {fieldName === "url" ? "URL" : fieldName}
                  </label>
                  <Input
                    className="mb-1"
                    id={`content-options-${fieldName}`}
                    name={fieldName}
                    onChange={(event) => {
                      const contentOptions = {
                        ...currentContentOptions.current,
                        [fieldName]: event.target.value,
                      };
                      currentContentOptions.current = contentOptions;
                      setContentOptionsValues(contentOptions);
                    }}
                    type="text"
                    value={
                      typeof contentOptionsValues[fieldName] === "string"
                        ? contentOptionsValues[fieldName]
                        : descriptor.defaultValue
                    }
                  />
                  <Button
                    type="button"
                    disabled={isLoadingData || hasUnsupportedContentOptions}
                    onClick={() => {
                      void onContentOptionsChange(currentContentOptions.current);
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
            data-testid="content-data-error"
            role="alert"
          >
            <p className="m-0 font-mono font-semibold">{dataError.code}</p>
            <p className="mb-0 mt-2">{dataError.message}</p>
          </div>
        ) : null}

        {requestError !== undefined ? (
          <div
            className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            data-testid="content-request-error"
            role="alert"
          >
            {requestError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
