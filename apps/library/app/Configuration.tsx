import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import { Outline } from "../components/outline/Outline";
import type { IModule } from "../types";

import { FetcherConfiguration } from "./FetcherConfiguration";

export function Configuration(props: {
  module: IModule;
  data: unknown;
  showData?: boolean;
  setData: (data: unknown) => void;
}) {
  const configuration = props.module.configuration;
  if (configuration === undefined) {
    return (
      <div>
        <Outline.Title>Configuration</Outline.Title>
        {props.showData !== false && (
          <div className="overflow-auto bg-zinc-100 px-2 py-4">
            <JsonView
              shouldExpandNode={collapseAllNested}
              data={{ data: props.data }}
              style={{ ...defaultStyles, container: "bg-zinc-100" }}
            />
          </div>
        )}
      </div>
    );
  }

  switch (configuration.configurationType) {
    case "form":
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
            {configuration.form({ data: props.data, onChange: props.setData })}
          </div>
        </div>
      );
    case "fetcher":
      return (
        <FetcherConfiguration
          configuration={configuration}
          moduleId={props.module.def.moduleId}
          showData={props.showData}
          data={props.data}
          setData={props.setData}
        />
      );
  }
}
