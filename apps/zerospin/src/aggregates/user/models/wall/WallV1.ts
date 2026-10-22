import { modelRef, makeModelVersion, primitives } from "@zerospin/sdk/browser";

import { page } from "../page/page";

import { wall } from "./wall";
import { wallLayoutSchema } from "../../layout/wallLayoutSchema";

export const wallV1 = makeModelVersion(wall, {
  version: 1,
  attributes: {
    pageId: modelRef({ model: page, relation: "page", inverse: "walls" }),
    breakpoint: primitives.enum({ values: ["sm", "md", "lg", "xl"] }),
    layout: primitives.json({ schema: wallLayoutSchema }),
  },
  indexes: [{ name: "page_breakpoint", columns: ["pageId", "breakpoint"], unique: true }],
});
