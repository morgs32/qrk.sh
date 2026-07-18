import { makeModel } from "@zerospin/core/models/makeModel";
import { primitives } from "@zerospin/core/models/primitives";

import { Grid } from "./Grid";

export const Brick = makeModel(
  {
    abbreviation: "brck",
    modelName: "brick",
    attributes: {
      gridId: primitives.ref({
        table: Grid.table,
        relation: "grid",
        inverse: "bricks",
      }),
      brickKey: primitives.text(),
      x: primitives.integer(),
      y: primitives.integer(),
      w: primitives.integer(),
      h: primitives.integer(),
      collectionName: primitives.text(),
      variant: primitives.text(),
      size: primitives.text(),
    },
    indexes: [],
    version: "1.0.0",
  },
  [],
);
