import { modelRef, makeModelVersion, primitives } from "@zerospin/sdk/browser";
import { page } from "../page/page";
import { PageSnapshotSchema } from "../../snapshots/pageSnapshotSchema";
import { pageSnapshot } from "./pageSnapshot";

export const pageSnapshotV2 = makeModelVersion(pageSnapshot, {
  version: "2.0.0",
  attributes: {
    pageId: modelRef({ model: page, relation: "page", inverse: "snapshots" }),
    content: primitives.json({ schema: PageSnapshotSchema }),
  },
  indexes: [],
});
