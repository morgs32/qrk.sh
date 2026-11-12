import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { PageSnapshotSchemaV9 } from "../../snapshots/pageSnapshotSchemaV9";
import { pageSnapshotV8 } from "./PageSnapshotV8";

export const pageSnapshotV9 = upgradeModelVersion(pageSnapshotV8, {
  version: 9,
  attributes: { content: primitives.json({ schema: PageSnapshotSchemaV9 }) },
});
