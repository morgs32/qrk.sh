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
  moduleId: string | undefined;
  data: unknown;
  showData?: boolean;
  setData: (data: unknown) => void;
}) {
  const {
    moduleOptionsShape,
    moduleOptionsForm: ModuleOptionsForm,
    fetcher: fetchData} = props.configuration;
  const [moduleOptionsValues, setModuleOptionsValues] = useState<Record<string, unknown>>(() => {
    const initialModuleOptionsValues: Record<string, unknown> = {};

    // Initialize the complete module options from the declared field defaults.
    for (const [fieldName, descriptor] of Object.entries(moduleOptionsShape)) {
      initialModuleOptionsValues[fieldName] =
        "defaultValue" in descriptor ? descriptor.defaultValue : undefined;
    }
    return initialModuleOptionsValues;
  });
  const currentModuleOptions = useRef(moduleOptionsValues);
  const generation = useRef(0);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<IScrapeError>();
  const [requestError, setRequestError] = useState<string>();
  const hasUnsupportedModuleOptions =
    ModuleOptionsForm === undefined &&
    Object.entries(moduleOptionsShape).some(
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

  async function onModuleOptionsChange(moduleOptions: Record<string, unknown>) {
    // Snapshot the next complete module options synchronously, including batched changes.
    currentModuleOptions.current = moduleOptions;
    setModuleOptionsValues(moduleOptions);
    const requestGeneration = ++generation.current;
    setDataError(undefined);
    setRequestError(undefined);

    if (hasUnsupportedModuleOptions) return;
    setIsLoadingData(true);
    try {
      using api = newSyncRpcSession<ScraperApi>("/scraper-rpc");
      const result = await fetchData({
        api,
        moduleOptions,
        setData: (data) => {
          if (generation.current === requestGeneration) props.setData(data);
        }});
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
        <div className="overflow-auto bg-zinc-100 px-2 py-4" data-testid="module-data-result">
          <JsonView
            shouldExpandNode={collapseAllNested}
            data={{ data: props.data }}
            style={{ ...defaultStyles, container: "bg-zinc-100" }}
          />
        </div>
      )}

      <div className="px-4 py-5">
        <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
          {ModuleOptionsForm !== undefined ? (
            <ModuleOptionsForm
              value={moduleOptionsValues}
              onChange={(value) => {
                void onModuleOptionsChange(value);
              }}
            />
          ) : (
            Object.entries(moduleOptionsShape).map(([fieldName, descriptor]) => {
              if (
                descriptor.kind !== PrimitiveKind.Text ||
                descriptor.nullable !== false ||
                typeof descriptor.defaultValue !== "string"
              ) {
                return (
                  <p
                    className="m-0 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                    data-testid={`unsupported-module-options-${fieldName}`}
                    key={fieldName}
                    role="alert"
                  >
                    Unsupported module options field &quot;{fieldName}
                    &quot;: only non-null text primitives with string defaults are supported.
                  </p>
                );
              }

              return (
                <div className="flex flex-col items-start gap-2" key={fieldName}>
                  <label
                    className="block text-sm font-medium"
                    htmlFor={`module-options-${fieldName}`}
                  >
                    {fieldName === "url" ? "URL" : fieldName}
                  </label>
                  <Input
                    className="mb-1"
                    id={`module-options-${fieldName}`}
                    name={fieldName}
                    onChange={(event) => {
                      const moduleOptions = {
                        ...currentModuleOptions.current,
                        [fieldName]: event.target.value};
                      currentModuleOptions.current = moduleOptions;
                      setModuleOptionsValues(moduleOptions);
                    }}
                    type="text"
                    value={
                      typeof moduleOptionsValues[fieldName] === "string"
                        ? moduleOptionsValues[fieldName]
                        : descriptor.defaultValue
                    }
                  />
                  <Button
                    type="button"
                    disabled={isLoadingData || hasUnsupportedModuleOptions}
                    onClick={() => {
                      void onModuleOptionsChange(currentModuleOptions.current);
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
            data-testid="module-data-error"
            role="alert"
          >
            <p className="m-0 font-mono font-semibold">{dataError.code}</p>
            <p className="mb-0 mt-2">{dataError.message}</p>
          </div>
        ) : null}

        {requestError !== undefined ? (
          <div
            className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            data-testid="module-request-error"
            role="alert"
          >
            {requestError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
