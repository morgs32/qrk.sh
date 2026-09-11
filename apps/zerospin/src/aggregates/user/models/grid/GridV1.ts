import { models, primitives } from "@zerospin/sdk/browser";

import { pageV1 as Page } from "../page/PageV1";

import { grid } from "./grid";

export const gridV1 = models.makeVersion(grid, {
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
