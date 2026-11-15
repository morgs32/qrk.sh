import { makeModelVersion, modelRef, primitives } from "@zerospin/sdk/browser";
import { page } from "../page/page";
import { pageSnapshot } from "./pageSnapshot";
import { pageSnapshotSchema } from "./pageSnapshotSchema";

export const pageSnapshotV1 = makeModelVersion(pageSnapshot, {
  version: 1,
  attributes: {
    pageId: modelRef({ model: page, relation: "page", inverse: "snapshots" }),
    content: primitives.json({ schema: pageSnapshotSchema }),
  },
  indexes: [],
});
