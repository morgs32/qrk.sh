import { makeModel } from "@zerospin/core/models/makeModel";
import { primitives } from "@zerospin/core/models/primitives";

import { Grid } from "./Grid";

export const GridItem = makeModel(
  {
    abbreviation: "gitm",
    modelName: "gridItem",
    attributes: {
      gridId: primitives.ref({
        table: Grid.table,
        relation: "grid",
        inverse: "items",
      }),
      itemKey: primitives.text(),
      x: primitives.integer(),
      y: primitives.integer(),
      w: primitives.integer(),
      h: primitives.integer(),
      collectionName: primitives.text(),
      brickName: primitives.text(),
    },
    indexes: [],
    version: "1.0.0",
  },
  [],
);
