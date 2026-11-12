import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { PageSnapshotSchemaV7 } from "../../snapshots/pageSnapshotSchemaV7";
import { pageSnapshotV6 } from "./PageSnapshotV6";

export const pageSnapshotV7 = upgradeModelVersion(pageSnapshotV6, {
  version: 7,
  attributes: {
    content: primitives.json({ schema: PageSnapshotSchemaV7 }),
  },
});
