import { models, primitives } from "@zerospin/sdk/browser";

import { Grid } from "./Grid";

export const Brick = models.makeVersion(models.makeModel({ name: "brick", abbreviation: "brck" }), {
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
});
