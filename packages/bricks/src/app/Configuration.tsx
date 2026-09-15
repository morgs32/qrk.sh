import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import type { ICatalog } from "../types";
import { Outline } from "../Outline";
import { FetcherConfiguration } from "./FetcherConfiguration";

export function Configuration(props: {
  content: ICatalog["contents"][string];
  data: unknown;
  showData?: boolean;
  setData: (data: unknown) => void;
}) {
  const configuration = props.content.configuration;
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
            <div className="overflow-auto bg-zinc-100 px-2 py-4" data-testid="content-data-result">
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
          catalogName={Object.values(props.content.views)[0]?.def.catalogName}
          showData={props.showData}
          data={props.data}
          setData={props.setData}
        />
      );
  }
}
