import { makeModelVersion, primitives } from "@zerospin/sdk/browser";
import { pageV3 } from "../page/PageV3";
import { wall } from "./wall";

export const wallV1 = makeModelVersion(wall, {
  version: "1.0.0",
  attributes: {
    pageId: primitives.ref({ table: pageV3.table, relation: "page", inverse: "walls" }),
    breakpoint: primitives.enum({ values: ["sm", "md", "lg", "xl"] }),
  },
  indexes: [{ name: "page_breakpoint", columns: ["pageId", "breakpoint"], unique: true }],
});
