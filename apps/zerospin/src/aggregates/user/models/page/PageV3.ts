import { modelRef, upgradeModelVersion } from "@zerospin/sdk/browser";
import { site as Site } from "../site/site";

import { pageV2 } from "./PageV2";

export const pageV3 = upgradeModelVersion(pageV2, {
  version: "3.0.0",
  attributes: {
    siteId: modelRef({
      model: Site,
      relation: "site",
      inverse: "pages",
    }),
  },
});
