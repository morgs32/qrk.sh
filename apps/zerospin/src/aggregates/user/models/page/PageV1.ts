import { models, primitives } from "@zerospin/sdk/browser";

import { siteV1 as Site } from "../site/SiteV1";

import { page } from "./page";

export const pageV1 = models.makeVersion(page, {
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
