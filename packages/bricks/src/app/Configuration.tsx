import { JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import type { ICollection } from "../types";
import { FetcherConfiguration } from "./FetcherConfiguration";

export function Configuration(props: {
  variant: ICollection["variants"][string];
  data: unknown;
  setData: (data: unknown) => void;
}) {
  const configuration = props.variant.configuration;
  if (configuration === undefined) {
    return (
      <div className="overflow-auto px-6 text-xs">
        <JsonView data={props.variant} />
      </div>
    );
  }

  switch (configuration.configurationType) {
    case "fetcher":
      return (
        <FetcherConfiguration
          configuration={configuration}
          collectionName={Object.values(props.variant.sizes)[0]?.def.collectionName}
          data={props.data}
          setData={props.setData}
        />
      );
  }
}
