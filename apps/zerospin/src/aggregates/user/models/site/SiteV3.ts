import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";

import { siteV2 } from "./SiteV2";

export const siteV3 = upgradeModelVersion(siteV2, {
  version: "3.0.0",
  attributes: {
    stickyNavbar: primitives.boolean({ defaultValue: true }),
    cardStyle: primitives.boolean({ defaultValue: false }),
  },
});
