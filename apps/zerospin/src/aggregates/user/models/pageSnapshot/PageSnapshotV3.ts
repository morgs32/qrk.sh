import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { PageSnapshotSchemaV3 } from "../../snapshots/pageSnapshotSchemaV3";
import { pageSnapshotV2 } from "./PageSnapshotV2";

export const pageSnapshotV3 = upgradeModelVersion(pageSnapshotV2, {
  version: 3,
  attributes: {
    content: primitives.json({ schema: PageSnapshotSchemaV3 }),
  },
});
