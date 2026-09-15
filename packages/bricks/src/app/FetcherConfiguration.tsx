import { useEffect, useRef, useState } from "react";

import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { PrimitiveKind } from "@zerospin/schema";
import "react-json-view-lite/dist/index.css";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";

import type { IFetcherConfiguration } from "../makeFetcherConfiguration";
import { Outline } from "../Outline";
import type { ScraperApi } from "../scraper/ScraperApi.public";
import type { IScrapeError } from "../scraper/types.public";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function FetcherConfiguration(props: {
  configuration: IFetcherConfiguration;
  catalogName: string | undefined;
  data: unknown;
  showData?: boolean;
  setData: (data: unknown) => void;
}) {
  const {
    registryOptionsShape,
    registryOptionsForm: RegistryOptionsForm,
    fetcher: fetchData,
  } = props.configuration;
  const [registryOptionsValues, setRegistryOptionsValues] = useState<Record<string, unknown>>(
    () => {
      const initialRegistryOptionsValues: Record<string, unknown> = {};

      // Initialize the complete registry options from the declared field defaults.
      for (const [fieldName, descriptor] of Object.entries(registryOptionsShape)) {
        initialRegistryOptionsValues[fieldName] =
          "defaultValue" in descriptor ? descriptor.defaultValue : undefined;
      }
      return initialRegistryOptionsValues;
    },
  );
  const currentRegistryOptions = useRef(registryOptionsValues);
  const generation = useRef(0);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<IScrapeError>();
  const [requestError, setRequestError] = useState<string>();
  const hasUnsupportedRegistryOptions =
    RegistryOptionsForm === undefined &&
    Object.entries(registryOptionsShape).some(
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

  async function onRegistryOptionsChange(registryOptions: Record<string, unknown>) {
    // Snapshot the next complete registry options synchronously, including batched changes.
    currentRegistryOptions.current = registryOptions;
    setRegistryOptionsValues(registryOptions);
    const requestGeneration = ++generation.current;
    setDataError(undefined);
    setRequestError(undefined);

    if (hasUnsupportedRegistryOptions) return;
    setIsLoadingData(true);
    try {
      using api = newSyncRpcSession<ScraperApi>("/scraper-rpc");
      const result = await fetchData({
        api,
        registryOptions,
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
        <div className="overflow-auto bg-zinc-100 px-2 py-4" data-testid="registry-data-result">
          <JsonView
            shouldExpandNode={collapseAllNested}
            data={{ data: props.data }}
            style={{ ...defaultStyles, container: "bg-zinc-100" }}
          />
        </div>
      )}

      <div className="px-4 py-5">
        <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
          {RegistryOptionsForm !== undefined ? (
            <RegistryOptionsForm
              value={registryOptionsValues}
              onChange={(value) => {
                void onRegistryOptionsChange(value);
              }}
            />
          ) : (
            Object.entries(registryOptionsShape).map(([fieldName, descriptor]) => {
              if (
                descriptor.kind !== PrimitiveKind.Text ||
                descriptor.nullable !== false ||
                typeof descriptor.defaultValue !== "string"
              ) {
                return (
                  <p
                    className="m-0 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                    data-testid={`unsupported-registry-options-${fieldName}`}
                    key={fieldName}
                    role="alert"
                  >
                    Unsupported registry options field &quot;{fieldName}
                    &quot;: only non-null text primitives with string defaults are supported.
                  </p>
                );
              }

              return (
                <div className="flex flex-col items-start gap-2" key={fieldName}>
                  <label
                    className="block text-sm font-medium"
                    htmlFor={`registry-options-${fieldName}`}
                  >
                    {fieldName === "url" ? "URL" : fieldName}
                  </label>
                  <Input
                    className="mb-1"
                    id={`registry-options-${fieldName}`}
                    name={fieldName}
                    onChange={(event) => {
                      const registryOptions = {
                        ...currentRegistryOptions.current,
                        [fieldName]: event.target.value,
                      };
                      currentRegistryOptions.current = registryOptions;
                      setRegistryOptionsValues(registryOptions);
                    }}
                    type="text"
                    value={
                      typeof registryOptionsValues[fieldName] === "string"
                        ? registryOptionsValues[fieldName]
                        : descriptor.defaultValue
                    }
                  />
                  <Button
                    type="button"
                    disabled={isLoadingData || hasUnsupportedRegistryOptions}
                    onClick={() => {
                      void onRegistryOptionsChange(currentRegistryOptions.current);
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
            data-testid="registry-data-error"
            role="alert"
          >
            <p className="m-0 font-mono font-semibold">{dataError.code}</p>
            <p className="mb-0 mt-2">{dataError.message}</p>
          </div>
        ) : null}

        {requestError !== undefined ? (
          <div
            className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            data-testid="registry-request-error"
            role="alert"
          >
            {requestError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
