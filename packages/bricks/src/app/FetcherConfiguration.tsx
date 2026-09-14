import { PrimitiveKind } from "@zerospin/schema";
import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import { useEffect, useRef, useState } from "react";
import type { ScraperApi } from "../scraper/ScraperApi.public";
import type { IScrapeError } from "../scraper/types.public";
import type { IFetcherConfiguration } from "../makeFetcherConfiguration";
import { OrderedTableOfContents } from "../OrderedTableOfContents";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

export function FetcherConfiguration(props: {
  configuration: IFetcherConfiguration;
  collectionName: string | undefined;
  data: unknown;
  setData: (data: unknown) => void;
}) {
  const { payloadShape, payloadForm, fetcher: fetchData } = props.configuration;
  const [payloadValues, setPayloadValues] = useState<Record<string, unknown>>(() => {
    const initialPayloadValues: Record<string, unknown> = {};

    // Build one controlled value for every declared payload field. Custom
    // renderers are type-rejected when their descriptor has no default, so the
    // workbench never invents an undefined value for those controls.
    for (const [fieldName, descriptor] of Object.entries(payloadShape)) {
      initialPayloadValues[fieldName] =
        "defaultValue" in descriptor ? descriptor.defaultValue : undefined;
    }
    return initialPayloadValues;
  });
  const currentPayload = useRef(payloadValues);
  const generation = useRef(0);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<IScrapeError>();
  const [requestError, setRequestError] = useState<string>();
  const hasUnsupportedPayload = Object.entries(payloadShape).some(
    ([fieldName, descriptor]) =>
      payloadForm?.[fieldName] === undefined &&
      (descriptor.kind !== PrimitiveKind.Text ||
        descriptor.nullable !== false ||
        typeof descriptor.defaultValue !== "string"),
  );

  useEffect(
    () => () => {
      // Outstanding RPC sessions still dispose when they settle, but cannot publish.
      generation.current += 1;
    },
    [],
  );

  async function onPayloadChange(fieldName: string, value: unknown) {
    // Snapshot the next complete payload synchronously, including batched changes.
    const payload = { ...currentPayload.current, [fieldName]: value };
    currentPayload.current = payload;
    setPayloadValues(payload);
    const requestGeneration = ++generation.current;
    setDataError(undefined);
    setRequestError(undefined);

    if (fetchData === undefined || hasUnsupportedPayload) return;
    setIsLoadingData(true);
    try {
      using api = newSyncRpcSession<ScraperApi>("/scraper-rpc");
      const result = await fetchData({
        api,
        payload,
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
      <OrderedTableOfContents.Title>Configure</OrderedTableOfContents.Title>
      {fetchData === undefined ? (
        <div className="overflow-auto bg-zinc-100 px-2 py-4" data-testid="variant-payload-result">
          <JsonView
            shouldExpandNode={collapseAllNested}
            data={payloadValues}
            style={{ ...defaultStyles, container: "bg-zinc-100" }}
          />
        </div>
      ) : (
        <div className="overflow-auto bg-zinc-100 px-2 py-4" data-testid="variant-data-result">
          <JsonView
            shouldExpandNode={collapseAllNested}
            data={{ data: props.data }}
            style={{ ...defaultStyles, container: "bg-zinc-100" }}
          />
        </div>
      )}
      <div className="px-6">
        <form className="mt-5 space-y-5" onSubmit={(event) => event.preventDefault()}>
          {Object.entries(payloadShape).map(([fieldName, descriptor]) => {
            const PayloadField = payloadForm?.[fieldName];

            if (PayloadField !== undefined) {
              return (
                <div className="space-y-2" key={fieldName}>
                  {props.collectionName === "icon" && fieldName === "hash" ? null : (
                    <label className="block text-sm font-medium">{fieldName}</label>
                  )}
                  <PayloadField
                    value={payloadValues[fieldName]}
                    onChange={(value: unknown) => {
                      void onPayloadChange(fieldName, value);
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
                  Unsupported payload field &quot;{fieldName}&quot;: only non-null text primitives
                  with string defaults are supported.
                </p>
              );
            }

            return (
              <div className="flex flex-col items-start gap-2" key={fieldName}>
                <label className="block text-sm font-medium" htmlFor={`payload-${fieldName}`}>
                  {fieldName === "url" ? "URL" : fieldName}
                </label>
                <Input
                  id={`payload-${fieldName}`}
                  name={fieldName}
                  onChange={(event) => {
                    const payload = {
                      ...currentPayload.current,
                      [fieldName]: event.target.value,
                    };
                    currentPayload.current = payload;
                    setPayloadValues(payload);
                  }}
                  type="text"
                  value={
                    typeof payloadValues[fieldName] === "string"
                      ? payloadValues[fieldName]
                      : descriptor.defaultValue
                  }
                />
                <Button
                  type="button"
                  disabled={isLoadingData || hasUnsupportedPayload}
                  onClick={() => {
                    void onPayloadChange(fieldName, currentPayload.current[fieldName]);
                  }}
                >
                  Submit
                </Button>
              </div>
            );
          })}
        </form>

        {isLoadingData ? <p role="status">Getting data...</p> : null}

        {fetchData !== undefined && dataError !== undefined ? (
          <div
            className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            data-testid="variant-data-error"
            role="alert"
          >
            <p className="m-0 font-mono font-semibold">{dataError.code}</p>
            <p className="mb-0 mt-2">{dataError.message}</p>
          </div>
        ) : null}

        {fetchData !== undefined && requestError !== undefined ? (
          <div
            className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            data-testid="variant-request-error"
            role="alert"
          >
            {requestError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
