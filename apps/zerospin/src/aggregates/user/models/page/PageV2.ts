import { modelRef, primitives, upgradeModelVersion } from "@zerospin/sdk/browser";
import { site as Site } from "../site/site";
import { pageSnapshot } from "../pageSnapshot/pageSnapshot";
import { pageV1 } from "./PageV1";

export const pageV2 = upgradeModelVersion(pageV1, {
  version: "2.0.0",
  attributes: {
    siteId: modelRef({
      model: Site,
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
