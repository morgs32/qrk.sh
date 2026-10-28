import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { PageSnapshotSchemaV2 } from "../../snapshots/pageSnapshotSchemaV2";
import { pageSnapshotV1 } from "./PageSnapshotV1";

export const pageSnapshotV2 = upgradeModelVersion(pageSnapshotV1, {
  version: 2,
  attributes: {
    content: primitives.json({ schema: PageSnapshotSchemaV2 }),
  },
});
