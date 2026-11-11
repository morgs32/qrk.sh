import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { PageSnapshotSchemaV5 } from "../../snapshots/pageSnapshotSchemaV5";
import { pageSnapshotV4 } from "./PageSnapshotV4";

export const pageSnapshotV5 = upgradeModelVersion(pageSnapshotV4, {
  version: 5,
  attributes: {
    content: primitives.json({ schema: PageSnapshotSchemaV5 }),
  },
});
