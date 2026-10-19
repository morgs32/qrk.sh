import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";

import { pageV3 as Page } from "../page/PageV3";

import { pageSnapshotV1 } from "./PageSnapshotV1";

export const pageSnapshotV2 = upgradeModelVersion(pageSnapshotV1, {
  version: "2.0.0",
  attributes: {
    pageId: primitives.ref({
      table: Page.table,
      relation: "page",
      inverse: "snapshots",
    }),
  },
});
