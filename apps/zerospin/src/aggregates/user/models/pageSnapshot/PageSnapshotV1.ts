import { modelRef, makeModelVersion, primitives } from "@zerospin/sdk/browser";

import { page } from "../page/page";

import { PageSnapshotSchema } from "../../snapshots/pageSnapshotSchema";

import { pageSnapshot } from "./pageSnapshot";

export const pageSnapshotV1 = makeModelVersion(pageSnapshot, {
  version: 1,
  attributes: {
    pageId: modelRef({ model: page, relation: "page", inverse: "snapshots" }),
    content: primitives.json({ schema: PageSnapshotSchema }),
  },
  indexes: [],
});
