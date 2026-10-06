import { makeModelVersion } from "@zerospin/core/models/make/makeModelVersion";
import { primitives } from "@zerospin/shapes";

import { wall } from "./wall";

export const wallModelV1 = makeModelVersion(wall, {
  attributes: {
    label: primitives.text({ defaultValue: "Library" }),
  },
  indexes: [],
  version: "1.0.0",
});
