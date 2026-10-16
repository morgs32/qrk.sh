import { makeModelVersion, primitives } from "@zerospin/sdk/browser";
import { pageV2 as Page } from "../page/PageV2";
import { PageSnapshotSchema } from "../../snapshots/pageSnapshotSchema";
import { pageSnapshot } from "./pageSnapshot";

export const pageSnapshotV1 = makeModelVersion(pageSnapshot, {
  version: "1.0.0",
  attributes: {
    pageId: primitives.ref({
      table: Page.table,
      relation: "page",
      inverse: "snapshots",
    }),
    content: primitives.json({ schema: PageSnapshotSchema }),
  },
  indexes: [],
});
