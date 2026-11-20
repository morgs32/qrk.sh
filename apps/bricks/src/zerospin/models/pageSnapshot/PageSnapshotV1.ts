import { makeModelVersion, modelRef, primitives } from "@zerospin/sdk/browser";
import * as Schema from "effect/Schema";
import { creatorFileIdSchema } from "../../../creatorFile/creatorFileId";
import { page } from "../page/page";
import { pageSnapshot } from "./pageSnapshot";
import { pageSnapshotSchema } from "./pageSnapshotSchema";

export const pageSnapshotV1 = makeModelVersion(pageSnapshot, {
  version: 1,
  attributes: {
    pageId: modelRef({ model: page, relation: "page", inverse: "snapshots" }),
    content: primitives.json({ schema: pageSnapshotSchema }),
    referencedAssetIds: primitives.json({ schema: Schema.Array(creatorFileIdSchema) }),
  },
  indexes: [],
});
