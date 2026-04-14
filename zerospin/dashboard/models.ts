import { makeModel, primitives } from "zerospin";

export const Site = makeModel({
  abbreviation: "sit",
  modelName: "site",
  attributes: {
    name: primitives.text(),
  },
  version: 1,
});
