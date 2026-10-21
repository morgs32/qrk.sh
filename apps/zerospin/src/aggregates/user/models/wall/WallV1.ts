import { modelRef, makeModelVersion, primitives } from "@zerospin/sdk/browser";

import { page } from "../page/page";

import { wall } from "./wall";

export const wallV1 = makeModelVersion(wall, {
  version: 1,
  attributes: {
    pageId: modelRef({ model: page, relation: "page", inverse: "walls" }),
    breakpoint: primitives.enum({ values: ["sm", "md", "lg", "xl"] }),
  },
  indexes: [{ name: "page_breakpoint", columns: ["pageId", "breakpoint"], unique: true }],
});
