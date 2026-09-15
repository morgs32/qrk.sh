import { makeModelVersion, primitives } from "@zerospin/sdk/browser";

import { siteV2 as Site } from "../site/SiteV2";

import { page } from "./page";

export const pageV1 = makeModelVersion(page, {
  attributes: {
    siteId: primitives.ref({
      table: Site.table,
      relation: "site",
      inverse: "pages",
    }),
    slug: primitives.text(),
    title: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    description: primitives.text({
      nullable: true,
      defaultValue: null,
    }),
    pageType: primitives.enum({
      values: ["split-scroll", "shared-scroll"],
    }),
  },
  indexes: [],
  version: "1.0.0",
});
