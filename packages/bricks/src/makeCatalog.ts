import type { IFormConfiguration } from "./makeFormConfiguration";
import type { IFetcherConfiguration } from "./makeFetcherConfiguration";
import { mapValues } from "es-toolkit/object";
import type { IShape } from "@zerospin/schema";
import type { ReactNode } from "react";

import type { ICatalog, IBrick } from "./types";

export function makeCatalog(props: {
  catalogName: string;
  catalogLabel: string;
  catalogDescription: string;
  contents: Record<
    string,
    | {
        contentName: string;
        contentDescription: string;
        configuration?: never;
        dataShape: null;
        defaultData: null;
        views: Record<string, IBrick<string, string, (props: never) => ReactNode>>;
      }
    | {
        contentName: string;
        contentDescription: string;
        configuration?: IFormConfiguration | IFetcherConfiguration;
        dataShape: IShape;
        defaultData: unknown;
        views: Record<string, IBrick<string, string, (props: never) => ReactNode>>;
      }
  >;
}): ICatalog {
  const { catalogName, catalogLabel, catalogDescription, contents: rawContents } = props;

  const contents = mapValues(rawContents, (rawContent) => {
    const views = mapValues(rawContent.views, (brick) => {
      return {
        def: {
          catalogName,
          catalogLabel,
          content: brick.def.content,
          view: brick.def.view,
          w: brick.def.w,
          h: brick.def.h,
          label: brick.def.label,
          order: brick.def.order,
          data: rawContent.defaultData,
        },
        component: brick.component,
      };
    });

    if (rawContent.dataShape !== null) {
      return {
        contentName: rawContent.contentName,
        contentDescription: rawContent.contentDescription,
        configuration: rawContent.configuration,
        dataShape: rawContent.dataShape,
        defaultData: rawContent.defaultData,
        views,
      };
    }
    return {
      contentName: rawContent.contentName,
      contentDescription: rawContent.contentDescription,
      dataShape: rawContent.dataShape,
      defaultData: rawContent.defaultData,
      views,
    };
  });

  return {
    catalogName,
    catalogLabel,
    catalogDescription,
    contents,
  };
}
