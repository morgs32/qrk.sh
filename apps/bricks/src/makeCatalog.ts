import type { ReactNode } from "react";

import type { IShape } from "@zerospin/schema";
import { mapValues } from "es-toolkit/object";

import type { IFetcherConfiguration } from "./makeFetcherConfiguration";
import type { IFormConfiguration } from "./makeFormConfiguration";
import type { ICatalog, IBrick } from "./types";

export function makeCatalog(props: {
  catalogName: string;
  catalogLabel: string;
  catalogDescription: string;
  registries: Record<
    string,
    | {
        registryName: string;
        registryDescription: string;
        configuration?: never;
        dataShape: null;
        defaultData: null;
        def: IBrick["def"];
        component: (props: never) => ReactNode;
      }
    | {
        registryName: string;
        registryDescription: string;
        configuration?: IFormConfiguration | IFetcherConfiguration;
        dataShape: IShape;
        defaultData: unknown;
        def: IBrick["def"];
        component: (props: never) => ReactNode;
      }
  >;
}): ICatalog {
  const { catalogName, catalogLabel, catalogDescription, registries: rawContents } = props;

  const registries = mapValues(rawContents, (registry, key) => {
    if (key !== registry.def.registry) {
      throw new Error(
        `makeCatalog: registry key ${JSON.stringify(key)} must match registry ${JSON.stringify(registry.def.registry)}`,
      );
    }
    return {
      ...registry,
      def: {
        ...registry.def,
        catalogName,
        catalogLabel,
        data: registry.defaultData,
      },
    };
  });

  return {
    catalogName,
    catalogLabel,
    catalogDescription,
    registries,
  };
}
