import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { PageSnapshotSchemaV8 } from "../../snapshots/pageSnapshotSchemaV8";
import { pageSnapshotV7 } from "./PageSnapshotV7";

export const pageSnapshotV8 = upgradeModelVersion(pageSnapshotV7, {
  version: 8,
  attributes: { content: primitives.json({ schema: PageSnapshotSchemaV8 }) },
});
