import type { ReactNode } from "react";

import type { IShape } from "@zerospin/schema";
import { mapValues } from "es-toolkit/object";

import type { IFetcherConfiguration } from "./makeFetcherConfiguration";
import type { IFormConfiguration } from "./makeFormConfiguration";
import type { IGroup, IBrick } from "./types";

export function makeGroup(props: {
  id: string;
  label: string;
  description: string;
  catalogs: Record<
    string,
    | {
        label: string;
        description: string;
        configuration?: never;
        dataShape: null;
        defaultData: null;
        def: IBrick["def"];
        component: (props: never) => ReactNode;
      }
    | {
        label: string;
        description: string;
        configuration?: IFormConfiguration | IFetcherConfiguration;
        dataShape: IShape;
        defaultData: unknown;
        def: IBrick["def"];
        component: (props: never) => ReactNode;
      }
  >;
}): IGroup {
  const { id, label, description, catalogs: rawContents } = props;

  const catalogs = mapValues(rawContents, (catalog, key) => {
    if (key !== catalog.def.catalogId) {
      throw new Error(
        `makeGroup: catalog key ${JSON.stringify(key)} must match catalog ${JSON.stringify(catalog.def.catalogId)}`,
      );
    }
    return {
      ...catalog,
      def: {
        ...catalog.def,
        groupId: id,
        groupLabel: label,
        data: catalog.defaultData,
      },
    };
  });

  return {
    id,
    label,
    description,
    catalogs,
  };
}
