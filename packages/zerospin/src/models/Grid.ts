import { makeModel } from "@zerospin/core/models/makeModel";
import { primitives } from "@zerospin/core/models/primitives";

import { Page } from "./Page";

export const Grid = makeModel(
  {
    abbreviation: "grd",
    modelName: "grid",
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
    version: "2.0.0",
  },
  [],
);
