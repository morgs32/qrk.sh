import { makeModel, primitives } from "zerospin";

export const User = makeModel({
  abbreviation: "usr",
  modelName: "user",
  attributes: {
    name: primitives.text(),
  },
  version: 1,
});

export const LayoutItem = makeModel({
  abbreviation: "lyt",
  modelName: "layoutItem",
  attributes: {
    userId: primitives.ref({
      model: User,
      inverse: { name: "layoutItems", kind: "many" },
    }),
    gridKey: primitives.text(),
    x: primitives.integer(),
    y: primitives.integer(),
    w: primitives.integer(),
    h: primitives.integer(),
    collectionName: primitives.text(),
    variantName: primitives.text(),
    /** 0 = visible, 1 = soft-removed (zerospin has no boolean primitive). */
    removed: primitives.integer(),
  },
  version: 1,
});

export const TextTileContent = makeModel({
  abbreviation: "ttc",
  modelName: "textTileContent",
  attributes: {
    layoutItemId: primitives.ref({
      model: LayoutItem,
      inverse: { name: "textContent", kind: "one" },
    }),
    body: primitives.text(),
  },
  version: 1,
});
