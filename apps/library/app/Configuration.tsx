import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import type { IModule } from "../lib/types";

import { FetcherConfiguration } from "./FetcherConfiguration";

export function Configuration(props: {
  brickModule: IModule;
  data: unknown;
  showData?: boolean;
  setData: (data: unknown) => void;
}) {
  const data = props.brickModule.data;
  if (data === null || data.dataType === "static") {
    return null;
  }

  switch (data.dataType) {
    case "form":
      if (data.form === undefined) {
        return null;
      }
      return (
        <div>
          {props.showData !== false && (
            <div className="overflow-auto bg-white py-4" data-testid="module-data-result">
              <JsonView
                shouldExpandNode={collapseAllNested}
                data={{ data: props.data }}
                style={{ ...defaultStyles, container: "bg-white" }}
              />
            </div>
          )}
          <div className="py-5">
            {data.form({ data: props.data, onChange: props.setData })}
          </div>
        </div>
      );
    case "fetcher":
      return (
        <FetcherConfiguration
          configuration={data}
          moduleId={props.brickModule.def.moduleId}
          showData={props.showData}
          data={props.data}
          setData={props.setData}
        />
      );
  }
}
