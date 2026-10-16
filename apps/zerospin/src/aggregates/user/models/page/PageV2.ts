import { primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { siteV2 as Site } from "../site/SiteV2";
import { pageSnapshot } from "../pageSnapshot/pageSnapshot";
import { pageV1 } from "./PageV1";

export const pageV2 = upgradeModelVersion(pageV1, {
  version: "2.0.0",
  attributes: {
    siteId: primitives.ref({
      table: Site.table,
      relation: "site",
      inverse: "pages",
    }),
    isPublished: primitives.boolean({ defaultValue: false }),
    publishedSnapshotId: primitives.foreignKey({
      abbreviation: pageSnapshot.abbreviation,
      nullable: true,
    }),
  },
});
