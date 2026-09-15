import { makeModelVersion, primitives } from "@zerospin/sdk/browser";

import { pageV2 as Page } from "../page/PageV2";

import { grid } from "./grid";

export const gridV1 = makeModelVersion(grid, {
  attributes: {
    pageId: primitives.ref({
      table: Page.table,
      relation: "page",
      inverse: "grids",
    }),
    name: primitives.text(),
    columnCount: primitives.integer(),
    revision: primitives.integer(),
  },
  indexes: [],
  version: "1.0.0",
});
