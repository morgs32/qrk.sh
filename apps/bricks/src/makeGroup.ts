import type { ReactNode } from "react";

import type { IShape } from "@zerospin/schema";
import { mapValues } from "es-toolkit/object";

import type { IFetcherConfiguration } from "./makeFetcherConfiguration";
import type { IFormConfiguration } from "./makeFormConfiguration";
import type { IGroup, IBrick } from "./types";

export function makeGroup(props: {
  groupName: string;
  groupLabel: string;
  groupDescription: string;
  catalogs: Record<
    string,
    | {
        catalogName: string;
        catalogDescription: string;
        configuration?: never;
        dataShape: null;
        defaultData: null;
        def: IBrick["def"];
        component: (props: never) => ReactNode;
      }
    | {
        catalogName: string;
        catalogDescription: string;
        configuration?: IFormConfiguration | IFetcherConfiguration;
        dataShape: IShape;
        defaultData: unknown;
        def: IBrick["def"];
        component: (props: never) => ReactNode;
      }
  >;
}): IGroup {
  const { groupName, groupLabel, groupDescription, catalogs: rawContents } = props;

  const catalogs = mapValues(rawContents, (catalog, key) => {
    if (key !== catalog.def.catalog) {
      throw new Error(
        `makeGroup: catalog key ${JSON.stringify(key)} must match catalog ${JSON.stringify(catalog.def.catalog)}`,
      );
    }
    return {
      ...catalog,
      def: {
        ...catalog.def,
        groupName,
        groupLabel,
        data: catalog.defaultData,
      },
    };
  });

  return {
    groupName,
    groupLabel,
    groupDescription,
    catalogs,
  };
}
