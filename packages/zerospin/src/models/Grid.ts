import { makeModel } from "@zerospin/core/models/makeModel";
import { primitives } from "@zerospin/core/models/primitives";

import { Page } from "./Page";

export const Grid = makeModel({
  abbreviation: "grd",
  modelName: "grid",
  attributes: {
    pageId: primitives.ref({
      model: Page,
      inverse: { name: "grids", kind: "many" },
    }),
    name: primitives.text(),
    columnCount: primitives.integer(),
  },
  version: 1,
});
