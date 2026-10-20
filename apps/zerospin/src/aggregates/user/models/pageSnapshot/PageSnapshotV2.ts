import { makeModelVersion, primitives } from "@zerospin/sdk/browser";
import { pageV3 } from "../page/PageV3";
import { PageSnapshotSchema } from "../../snapshots/pageSnapshotSchema";
import { pageSnapshot } from "./pageSnapshot";

export const pageSnapshotV2 = makeModelVersion(pageSnapshot, {
  version: "2.0.0",
  attributes: {
    pageId: primitives.ref({ table: pageV3.table, relation: "page", inverse: "snapshots" }),
    content: primitives.json({ schema: PageSnapshotSchema }),
  },
  indexes: [],
});
