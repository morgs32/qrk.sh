import { makeModelVersion } from "@zerospin/core/models/makeModelVersion";
import { primitives } from "@zerospin/schema";

import { wall } from "./wall";

export const wallModelV1 = makeModelVersion(wall, {
  attributes: {
    label: primitives.text({ defaultValue: "Sandbox" }),
  },
  indexes: [],
  version: "1.0.0",
});
