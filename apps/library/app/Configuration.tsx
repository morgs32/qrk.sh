import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import type { IModule } from "../types";

import { FetcherConfiguration } from "./FetcherConfiguration";

export function Configuration(props: {
  brickModule: IModule;
  data: unknown;
  showData?: boolean;
  setData: (data: unknown) => void;
}) {
  const configuration = props.brickModule.configuration;
  if (configuration === undefined) {
    return (
      <div>
        <h2 className="m-0 shrink-0 px-4 py-4 font-normal">Configuration</h2>
        {props.showData !== false && (
          <div className="overflow-auto bg-white px-2 py-4">
            <JsonView
              shouldExpandNode={collapseAllNested}
              data={{ data: props.data }}
              style={{ ...defaultStyles, container: "bg-white" }}
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
          <h2 className="m-0 shrink-0 px-4 py-4 font-normal">Configuration</h2>
          {props.showData !== false && (
            <div className="overflow-auto bg-white px-2 py-4" data-testid="module-data-result">
              <JsonView
                shouldExpandNode={collapseAllNested}
                data={{ data: props.data }}
                style={{ ...defaultStyles, container: "bg-white" }}
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
          moduleId={props.brickModule.def.moduleId}
          showData={props.showData}
          data={props.data}
          setData={props.setData}
        />
      );
  }
}
