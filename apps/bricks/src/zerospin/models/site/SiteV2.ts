import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { siteV1 } from "./SiteV1";

export const siteV2 = upgradeModelVersion(siteV1, {
  version: 2,
  attributes: {
    hostname: primitives.text({ nullable: true, defaultValue: null }),
  },
});
