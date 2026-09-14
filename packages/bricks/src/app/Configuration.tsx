import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import type { ICollection } from "../types";
import { Outline } from "../Outline";
import { FetcherConfiguration } from "./FetcherConfiguration";

export function Configuration(props: {
  content: ICollection["contents"][string];
  data: unknown;
  setData: (data: unknown) => void;
}) {
  const configuration = props.content.configuration;
  if (configuration === undefined) {
    return (
      <div>
        <Outline.Title>Configure</Outline.Title>
        <div className="overflow-auto bg-zinc-100 px-2 py-4">
          <JsonView
            shouldExpandNode={collapseAllNested}
            data={{ data: props.data }}
            style={{ ...defaultStyles, container: "bg-zinc-100" }}
          />
        </div>
      </div>
    );
  }

  switch (configuration.configurationType) {
    case "form":
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
          <div className="px-6 py-5">
            {configuration.form({ data: props.data, onChange: props.setData })}
          </div>
        </div>
      );
    case "fetcher":
      return (
        <FetcherConfiguration
          configuration={configuration}
          collectionName={Object.values(props.content.views)[0]?.def.collectionName}
          data={props.data}
          setData={props.setData}
        />
      );
  }
}
