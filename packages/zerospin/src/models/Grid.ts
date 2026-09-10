import { models, primitives } from "@zerospin/sdk/browser";

import { Page } from "./Page";

export const Grid = models.makeVersion(models.makeModel({ name: "grid", abbreviation: "grd" }), {
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
