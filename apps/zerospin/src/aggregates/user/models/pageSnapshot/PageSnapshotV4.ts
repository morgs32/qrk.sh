import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { PageSnapshotSchemaV4 } from "../../snapshots/pageSnapshotSchemaV4";
import { pageSnapshotV3 } from "./PageSnapshotV3";

export const pageSnapshotV4 = upgradeModelVersion(pageSnapshotV3, {
  version: 4,
  attributes: {
    content: primitives.json({ schema: PageSnapshotSchemaV4 }),
  },
});
