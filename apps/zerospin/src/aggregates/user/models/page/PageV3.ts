import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";

import { siteV3 as Site } from "../site/SiteV3";

import { pageV2 } from "./PageV2";

export const pageV3 = upgradeModelVersion(pageV2, {
  version: "3.0.0",
  attributes: {
    siteId: primitives.ref({
      table: Site.table,
      relation: "site",
      inverse: "pages",
    }),
  },
});
