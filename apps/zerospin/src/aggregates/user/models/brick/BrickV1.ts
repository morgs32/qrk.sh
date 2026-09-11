import { models, primitives } from "@zerospin/sdk/browser";

import { gridV1 as Grid } from "../grid/GridV1";

import { brick } from "./brick";

export const brickV1 = models.makeVersion(brick, {
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
