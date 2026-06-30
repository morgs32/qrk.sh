import { makeBrick } from "../../makeBrick";
import { makeCollection } from "../../makeCollection";
import { OrangeBlocks1x1 } from "./OrangeBlocks1x1";
import { OrangeBlocks2x2 } from "./OrangeBlocks2x2";
import { OrangeBlocks4x1 } from "./OrangeBlocks4x1";

export const orangeBlocksCollection = makeCollection({
  collectionName: "orange-block",
  collectionLabel: "Orange blocks",
  bricks: {
    "2x2": makeBrick({ name: "2x2", w: 2, h: 2, label: "2×2", order: 1, component: OrangeBlocks1x1 }),
    "4x4": makeBrick({ name: "4x4", w: 4, h: 4, label: "4×4", order: 2, component: OrangeBlocks2x2 }),
    "8x2": makeBrick({ name: "8x2", w: 8, h: 2, label: "8×2", order: 0, component: OrangeBlocks4x1 }),
  },
});
