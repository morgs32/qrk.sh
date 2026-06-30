import { makeModel } from "@zerospin/core/models/makeModel";
import { primitives } from "@zerospin/core/models/primitives";

import { Grid } from "./Grid";

export const GridItem = makeModel({
  abbreviation: "gitm",
  modelName: "gridItem",
  attributes: {
    gridId: primitives.ref({
      model: Grid,
      inverse: { name: "items", kind: "many" },
    }),
    itemKey: primitives.text(),
    x: primitives.integer(),
    y: primitives.integer(),
    w: primitives.integer(),
    h: primitives.integer(),
    collectionName: primitives.text(),
    brickName: primitives.text(),
  },
  version: 1,
});
