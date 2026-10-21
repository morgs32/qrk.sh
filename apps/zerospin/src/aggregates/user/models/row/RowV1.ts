import { modelRef, makeModelVersion, primitives } from "@zerospin/sdk/browser";

import { stack } from "../stack/stack";

import { row } from "./row";

export const rowV1 = makeModelVersion(row, {
  version: 1,
  attributes: {
    stackId: modelRef({ model: stack, relation: "stack", inverse: "rows" }),
    position: primitives.integer(),
  },
  indexes: [{ name: "stack_position", columns: ["stackId", "position"] }],
});
