import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { PageSnapshotSchemaV6 } from "../../snapshots/pageSnapshotSchemaV6";
import { pageSnapshotV5 } from "./PageSnapshotV5";

export const pageSnapshotV6 = upgradeModelVersion(pageSnapshotV5, {
  version: 6,
  attributes: {
    content: primitives.json({ schema: PageSnapshotSchemaV6 }),
  },
});
